import { Router } from 'express';
import { validateSchedule } from '@escala/shared/utils/cltValidator.js';
import { addDays, getCycleWeek, getDayOfWeek, getWeekDates } from '@escala/shared/utils/dateUtils.js';
import { generateSchedule } from '@escala/shared/utils/scheduleGenerator.js';
import { recordAudit } from '../audit.js';
import { AppError, badRequest, found, sendOk } from '../errors.js';
import { assertDepartmentScope, requireRole, WRITE_ROLES } from '../middleware/auth.js';
import { scheduleGenerateSchema, schedulePublishSchema, scheduleQuerySchema, scheduleSaveSchema } from '../schemas.js';

/**
 * Rotas `/api/schedules`: leitura da semana com validação CLT, gravação e geração no servidor.
 * @param {{ repositories: import('../repositories/index.js').Repositories }} deps
 * @returns {import('express').Router}
 */
export function scheduleRoutes({ repositories, config = { now: () => new Date() } }) {
  const router = Router();
  const { departments, employees, shifts, absences, coverageRules, schedules, auditLogs } = repositories;

  /** Setor da organização e do escopo do usuário (SECTION_LEADER só os seus), ou 404. */
  async function scopedDepartment(req, departmentId) {
    assertDepartmentScope(req, departmentId);
    return found(await departments.get(req.orgId, departmentId));
  }

  /**
   * Carrega tudo que o validador e o gerador precisam para a semana (tudo da organização do token),
   * inclusive as duas semanas anteriores (virada de semana e regra dos três domingos seguidos).
   */
  async function loadContext(orgId, department, weekStartDate) {
    const [team, shiftList, rules, current, previous, earlier, next] = await Promise.all([
      employees.list(orgId, { departmentId: department.id }),
      shifts.list(orgId, { departmentId: department.id }),
      coverageRules.list(orgId, { departmentId: department.id }),
      schedules.listWeek(orgId, department.id, weekStartDate),
      schedules.listWeek(orgId, department.id, addDays(weekStartDate, -7)),
      schedules.listWeek(orgId, department.id, addDays(weekStartDate, -14)),
      schedules.listWeek(orgId, department.id, addDays(weekStartDate, 7)),
    ]);
    const absenceList = team.length ? await absences.list(orgId, { employeeId: { in: team.map((e) => e.id) } }) : [];
    return {
      team,
      shifts: shiftList,
      coverageRules: rules,
      assignments: current,
      previousAssignments: previous,
      earlierAssignments: earlier,
      nextAssignments: next,
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
      earlierAssignments: ctx.earlierAssignments,
      nextAssignments: ctx.nextAssignments,
      absences: ctx.absences,
      coverageRules: ctx.coverageRules,
      department: ctx.department,
    });

  const audit = (req, departmentId, action, details) =>
    recordAudit(auditLogs, req, { departmentId, action, details, now: config.now() });

  /** Snapshot compacto de uma célula: só o que identifica e descreve a atribuição. */
  const compactCell = (a) => ({
    employeeId: a.employeeId,
    date: a.date,
    type: a.type,
    ...(a.shiftId ? { shiftId: a.shiftId } : {}),
    isPinned: Boolean(a.isPinned),
  });
  const compactCells = (list) => list.map(compactCell).sort((x, y) => (x.date + x.employeeId).localeCompare(y.date + y.employeeId));
  /** Resumo do novo estado (contagens por tipo), sem repetir as células. */
  const summarize = (list) => ({
    total: list.length,
    work: list.filter((a) => a.type === 'WORK').length,
    off: list.filter((a) => a.type === 'OFF').length,
    absence: list.filter((a) => a.type === 'ABSENCE').length,
    pinned: list.filter((a) => a.isPinned).length,
  });

  /**
   * Grava a auditoria de uma alteração da semana: estado anterior (snapshot) e resumo do novo.
   * Se a semana estava publicada, o salvamento a devolveu para rascunho e isso também é registrado.
   */
  async function auditWeekChange(req, department, action, weekStartDate, before, previousCycle, after) {
    await audit(req, department.id, action, {
      weekStartDate,
      message: `Semana ${weekStartDate}: ${after.length} atribuições (antes: ${before.length}).`,
      statusBefore: previousCycle?.status ?? null,
      before: compactCells(before),
      after: summarize(after),
    });
    if (previousCycle?.status === 'PUBLISHED') {
      await audit(req, department.id, 'VOLTOU_PARA_RASCUNHO', {
        weekStartDate,
        message: `A semana ${weekStartDate} estava publicada e foi editada; voltou para rascunho e precisa ser publicada de novo.`,
        publishedAt: previousCycle.publishedAt ?? null,
        publishedBy: previousCycle.publishedBy ?? null,
      });
    }
  }

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
    const department = await scopedDepartment(req, departmentId);
    const ctx = await loadContext(req.orgId, department, weekStart);
    const cycle = await schedules.findCycle(req.orgId, departmentId, weekStart);
    sendOk(res, {
      departmentId,
      weekStartDate: weekStart,
      status: cycle?.status ?? 'DRAFT',
      cycle,
      assignments: ctx.assignments,
      validation: validate(weekStart, ctx, ctx.assignments),
    });
  });

  router.put('/', requireRole(...WRITE_ROLES), async (req, res) => {
    const input = scheduleSaveSchema.parse(req.body ?? {});
    const department = await scopedDepartment(req, input.departmentId);
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

    const previousCycle = await schedules.findCycle(req.orgId, department.id, input.weekStartDate);
    const saved = await schedules.saveWeek(req.orgId, {
      departmentId: department.id,
      weekStartDate: input.weekStartDate,
      cycleWeek: getCycleWeek(input.weekStartDate),
      assignments: input.assignments.map(toStored),
    });
    await auditWeekChange(req, department, 'SALVOU_ESCALA', input.weekStartDate, ctx.assignments, previousCycle, saved.assignments);
    sendOk(res, { cycle: saved.cycle, assignments: saved.assignments, validation: validate(input.weekStartDate, ctx, saved.assignments) });
  });

  router.post('/generate', requireRole(...WRITE_ROLES), async (req, res) => {
    const input = scheduleGenerateSchema.parse(req.body ?? {});
    const department = await scopedDepartment(req, input.departmentId);
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
      earlierAssignments: ctx.earlierAssignments,
      nextAssignments: ctx.nextAssignments,
      existingAssignments: ctx.assignments,
      absences: ctx.absences,
      coverageRules: ctx.coverageRules,
      department: ctx.department,
      peakDates: input.peakDates,
    });

    const previousCycle = await schedules.findCycle(req.orgId, department.id, input.weekStartDate);
    const saved = await schedules.saveWeek(req.orgId, {
      departmentId: department.id,
      weekStartDate: input.weekStartDate,
      cycleWeek: getCycleWeek(input.weekStartDate),
      assignments: generated.assignments.map(toStored),
    });
    await auditWeekChange(req, department, 'GEROU_ESCALA', input.weekStartDate, ctx.assignments, previousCycle, saved.assignments);
    sendOk(res, { cycle: saved.cycle, assignments: saved.assignments, validation: generated.validation });
  });

  /** Quantidade máxima de alertas vermelhos devolvidos no 409 de publicação. */
  const MAX_BLOCKING_ISSUES = 50;

  router.post('/publish', requireRole(...WRITE_ROLES), async (req, res) => {
    const input = schedulePublishSchema.parse(req.body ?? {});
    const department = await scopedDepartment(req, input.departmentId);
    const cycle = await schedules.findCycle(req.orgId, department.id, input.weekStartDate);
    if (!cycle) throw new AppError(422, 'NOT_ENOUGH_DATA', 'Salve ou gere a escala da semana antes de publicar.');
    if (cycle.status === 'PUBLISHED') {
      sendOk(res, { cycle, alreadyPublished: true });
      return;
    }

    const ctx = await loadContext(req.orgId, department, input.weekStartDate);
    if (ctx.assignments.length === 0) throw new AppError(422, 'NOT_ENOUGH_DATA', 'A semana não tem atribuições para publicar.');
    const validation = validate(input.weekStartDate, ctx, ctx.assignments);
    if (validation.summary.red > 0) {
      const blocking = validation.issues
        .filter((i) => i.severity === 'RED')
        .slice(0, MAX_BLOCKING_ISSUES)
        .map(({ code, severity, employeeId, date, message }) => ({ code, severity, employeeId, date, message }));
      throw new AppError(409, 'SCHEDULE_HAS_VIOLATIONS', `A escala tem ${validation.summary.red} alerta(s) vermelho(s) e não pode ser publicada.`, {
        red: validation.summary.red,
        issues: blocking,
      });
    }

    const publishedAt = config.now().toISOString();
    const published = found(await schedules.publishCycle(req.orgId, cycle.id, { publishedAt, publishedBy: req.user.id }));
    await audit(req, department.id, 'PUBLICOU_ESCALA', {
      weekStartDate: input.weekStartDate,
      message: `Semana ${input.weekStartDate} publicada.`,
      publishedAt,
      publishedBy: req.user.id,
      validation: validation.summary,
      assignments: compactCells(ctx.assignments),
    });
    sendOk(res, { cycle: published, validation: { status: validation.status, summary: validation.summary } });
  });

  return router;
}
