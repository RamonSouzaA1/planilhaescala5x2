import { Router } from 'express';
import { addDays, getDayOfWeek, diffDays, getWeekDates } from '@escala/shared/utils/dateUtils.js';
import { isSundayOffWeek, resolveSundayRule } from '@escala/shared/utils/sundayRotation.js';
import { notFound, sendOk } from '../errors.js';
import { publicTokenSchema } from '../schemas.js';

const TIMEZONE = 'America/Sao_Paulo';
const DAY_INDEX = { SEG: 0, TER: 1, QUA: 2, QUI: 3, SEX: 4, SAB: 5, DOM: 6 };
const SUNDAY_LOOKAHEAD_WEEKS = 12;

/** Data de hoje (YYYY-MM-DD) no fuso de Brasília. */
function todayInBrazil(now) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(now);
}

/**
 * Rota pública (sem login) do Magic Link, somente leitura:
 * `GET /api/public/minha-escala/:token`. Devolve o mínimo necessário (LGPD).
 * @param {{ repositories: import('../repositories/index.js').Repositories, config: import('../config.js').AppConfig }} deps
 * @returns {import('express').Router}
 */
export function publicRoutes({ repositories, config }) {
  const router = Router();

  router.get('/minha-escala/:token', async (req, res) => {
    const parsed = publicTokenSchema.safeParse(req.params.token);
    const employee = parsed.success ? await repositories.employees.findByAccessToken(parsed.data) : null;
    // Token inválido, inexistente ou de funcionário inativo: sempre o mesmo 404 genérico.
    if (!employee || employee.status === 'INACTIVE') throw notFound('Link inválido.');

    const orgId = employee.organizationId;
    const [department, shifts] = await Promise.all([
      repositories.departments.get(orgId, employee.departmentId),
      repositories.shifts.list(orgId, { departmentId: employee.departmentId }),
    ]);
    const shiftById = new Map(shifts.map((s) => [s.id, s]));

    const today = todayInBrazil(config.now());
    const currentMonday = addDays(today, -DAY_INDEX[getDayOfWeek(today)]);
    const weekStarts = [currentMonday, addDays(currentMonday, 7)];
    const dates = weekStarts.flatMap(getWeekDates);
    const assignments = await repositories.schedules.listForEmployee(orgId, employee.id, dates);
    const byDate = new Map(assignments.map((a) => [a.date, a]));

    const weeks = weekStarts.map((weekStartDate) => ({
      weekStartDate,
      days: getWeekDates(weekStartDate).map((date) => {
        const a = byDate.get(date);
        const shift = a?.type === 'WORK' && a.shiftId ? shiftById.get(a.shiftId) : undefined;
        return {
          date,
          dayOfWeek: getDayOfWeek(date),
          type: a?.type ?? null,
          shift: shift ? { name: shift.name, code: shift.code, startTime: shift.startTime, endTime: shift.endTime } : null,
        };
      }),
    }));

    // Próximo domingo de folga pelo rodízio (a partir de hoje).
    const rule = resolveSundayRule(employee, department ?? undefined);
    const cycleOffset = Number(department?.sundayCycleOffset) || 0;
    let nextSundayOff = null;
    for (let i = 0; i < SUNDAY_LOOKAHEAD_WEEKS && !nextSundayOff; i += 1) {
      const weekStart = addDays(currentMonday, i * 7);
      const sunday = addDays(weekStart, 6);
      if (sunday >= today && isSundayOffWeek(employee.sundayGroup, rule, weekStart, cycleOffset) === true) {
        nextSundayOff = { date: sunday, daysUntil: diffDays(today, sunday) };
      }
    }

    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow');
    sendOk(res, {
      firstName: String(employee.name).trim().split(/\s+/)[0],
      departmentName: department?.name ?? null,
      today,
      weeks,
      nextSundayOff,
    });
  });

  return router;
}
