import { Router } from 'express';
import { validateSchedule } from '@escala/shared/utils/cltValidator.js';
import { addDays, getCycleWeek, getDayOfWeek, getWeekDates } from '@escala/shared/utils/dateUtils.js';
import { generateSchedule } from '@escala/shared/utils/scheduleGenerator.js';
import { AppError, badRequest, found, sendOk } from '../errors.js';
import { requireRole, WRITE_ROLES } from '../middleware/auth.js';
import { scheduleGenerateSchema, scheduleQuerySchema, scheduleSaveSchema } from '../schemas.js';

/**
 * Rotas `/api/schedules`: leitura da semana com validação CLT, gravação e geração no servidor.
 * @param {{ repositories: import('../repositories/index.js').Repositories }} deps
 * @returns {import('express').Router}
 */
export function scheduleRoutes({ repositories }) {
  const router = Router();
  const { departments, employees, shifts, absences, coverageRules, schedules, auditLogs } = repositories;

  /** Carrega tudo que o validador e o gerador precisam para a semana (tudo da organização do token). */
  async function loadContext(orgId, department, weekStartDate) {
    const [team, shiftList, rules, current, previous] = await Promise.all([
      employees.list(orgId, { departmentId: department.id }),
      shifts.list(orgId, { departmentId: department.id }),
      coverageRules.list(orgId, { departmentId: department.id }),
      schedules.listWeek(orgId, department.id, weekStartDate),
      schedules.listWeek(orgId, department.id, addDays(weekStartDate, -7)),
    ]);
    const absenceList = team.length ? await absences.list(orgId, { employeeId: { in: team.map((e) => e.id) } }) : [];
    return {
      team,
      shifts: shiftList,
      coverageRules: rules,
      assignments: current,
      previousAssignments: previous,
      absences: absenceList,
      department: {
        defaultSundayRule: department.defaultSundayRule,
        weeklyHoursTarget: department.weeklyHoursTarget,
        minBreakMinutes: department.minBreakMinutes,
        sundayCycleOffset: department.sundayCycleOffset,
      },
    };
  }

  const validate = (weekStartDate, ctx, assignments) =>
    validateSchedule({
      weekStartDate,
      employees: ctx.team,
      shifts: ctx.shifts,
      assignments,
      previousAssignments: ctx.previousAssignments,
      absences: ctx.absences,
      coverageRules: ctx.coverageRules,
      department: ctx.department,
    });

  const audit = (req, departmentId, action, details) =>
    auditLogs.create(req.orgId, {
      departmentId,
      userId: req.user.id,
      action,
      details,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

  /** Remove campos internos e normaliza o shiftId antes de persistir. */
  const toStored = (a) => ({
    employeeId: a.employeeId,
    date: a.date,
    dayOfWeek: getDayOfWeek(a.date),
    type: a.type,
    shiftId: a.type === 'WORK' ? a.shiftId : undefined,
    isPinned: Boolean(a.isPinned),
  });

  router.get('/', async (req, res) => {
    const { departmentId, weekStart } = scheduleQuerySchema.parse(req.query);
    const department = found(await departments.get(req.orgId, departmentId));
    const ctx = await loadContext(req.orgId, department, weekStart);
    sendOk(res, {
      departmentId,
      weekStartDate: weekStart,
      cycle: await schedules.findCycle(req.orgId, departmentId, weekStart),
      assignments: ctx.assignments,
      validation: validate(weekStart, ctx, ctx.assignments),
    });
  });

  router.put('/', requireRole(...WRITE_ROLES), async (req, res) => {
    const input = scheduleSaveSchema.parse(req.body ?? {});
    const department = found(await departments.get(req.orgId, input.departmentId));
    const ctx = await loadContext(req.orgId, department, input.weekStartDate);

    const employeeIds = new Set(ctx.team.map((e) => e.id));
    const shiftIds = new Set(ctx.shifts.map((s) => s.id));
    const weekDates = new Set(getWeekDates(input.weekStartDate));
    const seen = new Set();
    for (const a of input.assignments) {
      if (!employeeIds.has(a.employeeId)) throw badRequest(`Funcionário não pertence ao setor: ${a.employeeId}.`);
      if (!weekDates.has(a.date)) throw badRequest(`A data ${a.date} está fora da semana ${input.weekStartDate}.`);
      if (a.type === 'WORK' && (!a.shiftId || !shiftIds.has(a.shiftId))) {
        throw badRequest(`Turno inválido para ${a.employeeId} em ${a.date}.`);
      }
      const key = `${a.employeeId}|${a.date}`;
      if (seen.has(key)) throw badRequest(`Atribuição duplicada para ${a.employeeId} em ${a.date}.`);
      seen.add(key);
    }

    const saved = await schedules.saveWeek(req.orgId, {
      departmentId: department.id,
      weekStartDate: input.weekStartDate,
      cycleWeek: getCycleWeek(input.weekStartDate),
      assignments: input.assignments.map(toStored),
    });
    await audit(req, department.id, 'SALVOU_ESCALA', `Semana ${input.weekStartDate}: ${saved.assignments.length} atribuições salvas.`);
    sendOk(res, { cycle: saved.cycle, assignments: saved.assignments, validation: validate(input.weekStartDate, ctx, saved.assignments) });
  });

  router.post('/generate', requireRole(...WRITE_ROLES), async (req, res) => {
    const input = scheduleGenerateSchema.parse(req.body ?? {});
    const department = found(await departments.get(req.orgId, input.departmentId));
    const ctx = await loadContext(req.orgId, department, input.weekStartDate);
    if (!ctx.team.some((e) => e.status !== 'INACTIVE')) {
      throw new AppError(422, 'NOT_ENOUGH_DATA', 'Cadastre ao menos um funcionário ativo antes de gerar a escala.');
    }
    if (ctx.shifts.length === 0) {
      throw new AppError(422, 'NOT_ENOUGH_DATA', 'Cadastre ao menos um turno antes de gerar a escala.');
    }

    const generated = generateSchedule({
      weekStartDate: input.weekStartDate,
      employees: ctx.team,
      shifts: ctx.shifts,
      previousAssignments: ctx.previousAssignments,
      existingAssignments: ctx.assignments,
      absences: ctx.absences,
      coverageRules: ctx.coverageRules,
      department: ctx.department,
      peakDates: input.peakDates,
    });

    const saved = await schedules.saveWeek(req.orgId, {
      departmentId: department.id,
      weekStartDate: input.weekStartDate,
      cycleWeek: getCycleWeek(input.weekStartDate),
      assignments: generated.assignments.map(toStored),
    });
    await audit(req, department.id, 'GEROU_ESCALA', `Semana ${input.weekStartDate}: escala gerada (${saved.assignments.length} atribuições).`);
    sendOk(res, { cycle: saved.cycle, assignments: saved.assignments, validation: generated.validation });
  });

  return router;
}
