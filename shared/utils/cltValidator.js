/**
 * Validador trabalhista "Semáforo CLT & Sindical" (spec, módulo 4).
 * Módulo puro, compartilhado entre web (alertas em tempo real) e api (pré-validação de trocas).
 *
 * Vermelho (infração):
 *   - interjornada < 11h (art. 66 CLT) e descanso semanal < 35h (Súmula 110 TST: 24h + 11h);
 *   - intrajornada insuficiente ou acima de 2h, presença no turno acima de 12h (art. 71 CLT)
 *     e jornada diária > 10h (art. 59 CLT);
 *   - mais de 6 dias seguidos (OJ 410 SDI-1/TST);
 *   - descanso e sequência de dias também na virada para a semana seguinte, quando informada;
 *   - semana fora do 5x2 e carga semanal acima do menor valor entre a meta do setor e o teto
 *     legal da data (EC 141/2026: 44h → 42h → 40h), contando a hora noturna reduzida
 *     (art. 73 CLT, 22h–05h, e a prorrogação após as 05h de quem cobre toda a faixa,
 *     Súmula 60, II, TST);
 *   - terceiro domingo seguido de trabalho (Lei 10.101/2000, art. 6º), quando o histórico
 *     das duas semanas anteriores foi informado;
 *   - escala em dia de férias/atestado.
 * Amarelo (operacional/sindical): cobertura mínima, tags obrigatórias, picos de horário,
 * rodízio de domingo e restrições individuais.
 */

import { addDays, diffDays, getDayOfWeek, getWeekDates, isMonday, timeToMinutes, toDateKey } from './dateUtils.js';
import { getLegalWeeklyCap } from './legalWeeklyCap.js';
import { isSundayOffWeek, resolveSundayRule } from './sundayRotation.js';

export {
  BASE_WEEKLY_CAP_HOURS,
  LEGAL_WEEKLY_CAP_STEPS,
  getLegalWeeklyCap,
  getLegalWeeklyCapHours,
} from './legalWeeklyCap.js';

export const SEVERITY = Object.freeze({ RED: 'RED', YELLOW: 'YELLOW' });

export const ISSUE_CODES = Object.freeze({
  INTERJORNADA: 'INTERJORNADA',
  WEEKLY_REST: 'WEEKLY_REST',
  INTRAJORNADA: 'INTRAJORNADA',
  DAILY_HOURS: 'DAILY_HOURS',
  CONSECUTIVE_DAYS: 'CONSECUTIVE_DAYS',
  WEEKLY_OFF_COUNT: 'WEEKLY_OFF_COUNT',
  ABSENCE_CONFLICT: 'ABSENCE_CONFLICT',
  WEEKLY_HOURS: 'WEEKLY_HOURS',
  COVERAGE_GAP: 'COVERAGE_GAP',
  MISSING_TAG: 'MISSING_TAG',
  PEAK_COVERAGE: 'PEAK_COVERAGE',
  SUNDAY_ROTATION: 'SUNDAY_ROTATION',
  SUNDAY_LAW: 'SUNDAY_LAW',
  RESTRICTION: 'RESTRICTION',
});

/** Domingos seguidos de trabalho a partir dos quais há infração (Lei 10.101/2000, art. 6º). */
export const MAX_CONSECUTIVE_WORKED_SUNDAYS = 2;

export const MIN_INTERJORNADA_MINUTES = 11 * 60;
export const MIN_WEEKLY_REST_MINUTES = 35 * 60;
export const MAX_DAILY_WORK_MINUTES = 10 * 60;
export const MAX_CONSECUTIVE_WORK_DAYS = 6;
/** Intervalo intrajornada máximo sem acordo escrito ou convenção (art. 71 caput CLT). */
export const MAX_BREAK_MINUTES = 120;
/** Presença máxima no turno, da entrada à saída (10h de jornada + 2h de intervalo). */
export const MAX_SHIFT_PRESENCE_MINUTES = 12 * 60;
export const WORK_DAYS_PER_WEEK = 5;
export const OFF_DAYS_PER_WEEK = 2;

/** Faixas de hora noturna (22h–05h) em minutos relativos ao dia de início do turno. */
const NIGHT_RANGES = [
  [0, 5 * 60],
  [22 * 60, 29 * 60],
  [46 * 60, 53 * 60],
];
/** Faixa noturna que começa no dia de início do turno (22h → 05h do dia seguinte). */
const NIGHT_START = 22 * 60;
const NIGHT_END = 29 * 60;

/**
 * @typedef {Object} Issue
 * @property {string} code - Um dos ISSUE_CODES
 * @property {'RED' | 'YELLOW'} severity
 * @property {string} [employeeId] - Ausente nos alertas do dia (cobertura)
 * @property {string | null} date - null nos alertas da semana inteira (folgas, carga horária)
 * @property {string} message - Texto em português para a interface
 * @property {Object} details
 */

/**
 * @typedef {Object} ValidationResult
 * @property {Issue[]} issues
 * @property {{ red: number, yellow: number, total: number }} summary
 * @property {'RED' | 'YELLOW' | 'GREEN'} status
 * @property {Record<string, Issue[]>} issuesByEmployee
 * @property {Record<string, Issue[]>} issuesByCell - chave `${employeeId}|${date}`
 * @property {Record<string, Issue[]>} issuesByDate - alertas de cobertura do dia
 */

/**
 * Janela do turno em minutos desde 00:00 do dia de início. Turnos que viram a
 * meia-noite terminam após 1440.
 * @param {{ startTime: string, endTime: string }} shift
 * @returns {{ start: number, end: number }}
 * @throws {Error} se algum horário for inválido
 */
export function getShiftWindow(shift) {
  const start = timeToMinutes(shift.startTime);
  let end = timeToMinutes(shift.endTime);
  if (end <= start) end += 1440;
  return { start, end };
}

/**
 * Minutos de relógio trabalhados no turno (descontado o intervalo intrajornada).
 * @param {{ startTime: string, endTime: string, breakDurationMinutes?: number }} shift
 * @returns {number}
 */
export function getShiftWorkMinutes(shift) {
  const { start, end } = getShiftWindow(shift);
  return end - start - (shift.breakDurationMinutes ?? 0);
}

/**
 * Minutos de relógio após as 05h que também são noturnos pela prorrogação (Súmula 60, II, TST):
 * só quando o turno cobre integralmente a faixa 22h–05h (começa até as 22h e termina às 05h
 * ou depois). Turnos que não cobrem toda a faixa não têm prorrogação.
 * @param {{ startTime: string, endTime: string }} shift
 * @returns {number}
 */
export function getShiftProrogatedNightMinutes(shift) {
  const { start, end } = getShiftWindow(shift);
  return start <= NIGHT_START && end > NIGHT_END ? end - NIGHT_END : 0;
}

/**
 * Minutos de relógio noturnos do turno: os da faixa 22h–05h (art. 73 §2º CLT) mais os
 * prorrogados após as 05h quando o turno cobre toda a faixa (Súmula 60, II, TST).
 * @param {{ startTime: string, endTime: string }} shift
 * @returns {number}
 */
export function getShiftNightMinutes(shift) {
  const { start, end } = getShiftWindow(shift);
  const inRange = NIGHT_RANGES.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(end, b) - Math.max(start, a)), 0);
  return inRange + getShiftProrogatedNightMinutes(shift);
}

/**
 * Duração legal do turno: a hora noturna tem 52min30s (art. 73 §1º CLT), então cada
 * minuto noturno vale 60/52,5 = 8/7 de minuto (acréscimo de 1/7). Os minutos noturnos incluem
 * a prorrogação após as 05h (Súmula 60, II, TST). O acréscimo é arredondado ao minuto mais
 * próximo uma vez por turno (a carga semanal soma os turnos já arredondados). O intervalo é
 * descontado como hora diurna (aproximação conservadora, pois não se sabe em que horário ele é
 * tirado): num turno todo noturno, isso pode somar até intervalo/7 minutos a mais.
 * @param {{ startTime: string, endTime: string, breakDurationMinutes?: number }} shift
 * @returns {number}
 */
export function getShiftLegalMinutes(shift) {
  return getShiftWorkMinutes(shift) + Math.round(getShiftNightMinutes(shift) / 7);
}

/**
 * Intervalo intrajornada mínimo (art. 71 CLT): acima de 6h de trabalho, 1h (reduzível
 * a 30 min por convenção coletiva, art. 611-A III); de 4h a 6h, 15 min.
 * @param {number} workMinutes
 * @param {number} [longShiftMinBreak=60] - department.minBreakMinutes (30 a 60)
 * @returns {number}
 */
export function getRequiredBreakMinutes(workMinutes, longShiftMinBreak = 60) {
  if (workMinutes > 6 * 60) return longShiftMinBreak;
  if (workMinutes > 4 * 60) return 15;
  return 0;
}

/**
 * Consolida as regras de cobertura de um dia da semana (pode haver mais de uma):
 * maior mínimo total, maior mínimo por tag e todos os picos.
 * @param {any[]} coverageRules
 * @param {string} dayOfWeek
 * @returns {{ minTotalStaff: number, requiredTags: Array<{ tag: string, minCount: number }>, peakHours: any[] } | null}
 */
export function getCoverageRuleForDay(coverageRules, dayOfWeek) {
  const rules = coverageRules.filter((r) => r.dayOfWeek === dayOfWeek);
  if (!rules.length) return null;
  const tagMin = new Map();
  for (const rule of rules) {
    for (const { tag, minCount } of rule.requiredTags ?? []) {
      tagMin.set(tag, Math.max(tagMin.get(tag) ?? 0, Number(minCount) || 0));
    }
  }
  return {
    minTotalStaff: Math.max(...rules.map((r) => Number(r.minTotalStaff) || 0)),
    requiredTags: [...tagMin.entries()].map(([tag, minCount]) => ({ tag, minCount })),
    peakHours: rules.flatMap((r) => r.peakHours ?? []),
  };
}

/**
 * Dias de ausência do colaborador na semana: 'VACATION' (férias) ou 'OTHER'
 * (atestado, banco de horas, outros). O status VACATION/MEDICAL_LEAVE sem
 * calendário cadastrado vale para a semana inteira.
 * @param {any} employee
 * @param {any[]} absences
 * @param {string[]} dates
 * @returns {Map<string, 'VACATION' | 'OTHER'>}
 */
export function getEmployeeAbsences(employee, absences, dates) {
  const result = new Map();
  if (employee.status === 'VACATION' || employee.status === 'MEDICAL_LEAVE') {
    const kind = employee.status === 'VACATION' ? 'VACATION' : 'OTHER';
    for (const date of dates) result.set(date, kind);
  }
  for (const absence of absences) {
    if (absence.employeeId !== employee.id) continue;
    const startDate = toDateKey(absence.startDate);
    const endDate = toDateKey(absence.endDate);
    for (const date of dates) {
      if (date >= startDate && date <= endDate) result.set(date, absence.type === 'VACATION' ? 'VACATION' : 'OTHER');
    }
  }
  return result;
}

/** @param {number} minutes */
function formatDuration(minutes) {
  const sign = minutes < 0 ? '-' : '';
  const abs = Math.abs(minutes);
  return `${sign}${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, '0')}`;
}

/** @param {string} date */
function formatDateBR(date) {
  const [, m, d] = date.split('-');
  return `${d}/${m}`;
}

/** @param {string} date 'YYYY-MM-DD' → 'DD/MM/AAAA' */
function formatFullDateBR(date) {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Limite semanal efetivo da semana: o menor entre a meta do setor e o teto legal vigente
 * na `weekStartDate`. Sem meta válida no setor, vale só o teto legal.
 * @param {string} weekStartDate
 * @param {{ weeklyHoursTarget?: number | string } | undefined} department
 * @returns {{ hours: number, minutes: number, source: 'LAW' | 'DEPARTMENT', legalCap: { hours: number, from: string | null, until: string | null } }}
 */
export function getWeeklyHoursLimit(weekStartDate, department) {
  const legalCap = getLegalWeeklyCap(weekStartDate);
  const target = Number(department?.weeklyHoursTarget);
  const hasTarget = Number.isFinite(target) && target > 0;
  const fromLaw = !hasTarget || legalCap.hours < target;
  const hours = fromLaw ? legalCap.hours : target;
  return { hours, minutes: Math.round(hours * 60), source: fromLaw ? 'LAW' : 'DEPARTMENT', legalCap };
}

/** Texto do limite para a mensagem de WEEKLY_HOURS, citando a norma quando o limite vem da lei. */
function describeWeeklyLimit(limit) {
  if (limit.source === 'DEPARTMENT') return `limite ${limit.hours}h`;
  const { from, until } = limit.legalCap;
  if (from) return `limite legal de ${limit.hours}h a partir de ${formatFullDateBR(from)}, EC 141/2026`;
  return `limite legal de ${limit.hours}h até ${formatFullDateBR(until)}, art. 7º, XIII, CF`;
}

/**
 * Agrupa atribuições por data, para consultas de cobertura.
 * @param {Array<{ date: string }>} assignments
 */
function groupByDate(assignments) {
  /** @type {Map<string, any[]>} */
  const byDate = new Map();
  for (const a of assignments) {
    if (!byDate.has(a.date)) byDate.set(a.date, []);
    byDate.get(a.date).push(a);
  }
  return byDate;
}

/**
 * Janelas [início, fim) de quem trabalha no dia, em minutos relativos à meia-noite de `date`,
 * incluindo a parte após a meia-noite dos turnos noturnos iniciados na véspera.
 * @param {Map<string, any[]>} byDate
 * @param {Map<string, any>} shiftById
 * @param {string} date
 * @returns {Array<{ start: number, end: number }>}
 */
function getActiveWindows(byDate, shiftById, date) {
  const windows = [];
  for (const offsetDays of [-1, 0, 1]) {
    const day = addDays(date, offsetDays);
    for (const a of byDate.get(day) ?? []) {
      if (a.type !== 'WORK' || !shiftById.has(a.shiftId)) continue;
      const { start, end } = getShiftWindow(shiftById.get(a.shiftId));
      const offset = offsetDays * 1440;
      windows.push({ start: start + offset, end: end + offset });
    }
  }
  return windows;
}

/** @param {Array<{ start: number, end: number }>} windows @param {number} minute */
function countActiveAt(windows, minute) {
  let count = 0;
  for (const w of windows) if (w.start <= minute && minute < w.end) count += 1;
  return count;
}

/** @param {any[]} assignments */
function normalizeAssignments(assignments) {
  return assignments.map((a) => ({ ...a, date: toDateKey(a.date) }));
}

/**
 * Quantas pessoas estão na loja em cada hora cheia do dia (heatmap do módulo 5).
 * @param {{ assignments: any[], shifts: any[], date: string }} input
 * @returns {number[]} 24 posições, índice = hora
 */
export function computeHourlyCoverage({ assignments, shifts, date }) {
  const shiftById = new Map(shifts.map((s) => [s.id, s]));
  const windows = getActiveWindows(groupByDate(normalizeAssignments(assignments)), shiftById, date).filter(
    (w) => w.start < 1440,
  );
  return Array.from({ length: 24 }, (_, hour) => countActiveAt(windows, hour * 60));
}

/**
 * Valida a escala semanal de um setor.
 * @param {Object} input
 * @param {string} input.weekStartDate - segunda-feira da semana validada
 * @param {any[]} input.employees
 * @param {any[]} input.shifts
 * @param {any[]} input.assignments - DailyAssignment da semana
 * @param {any[]} [input.previousAssignments] - DailyAssignment da semana anterior (virada de semana)
 * @param {any[]} [input.earlierAssignments] - DailyAssignment da semana retrasada (W-2). Usada só na
 *   regra dos três domingos seguidos; sem ela (ou sem a célula do domingo) não há alerta.
 * @param {any[]} [input.nextAssignments] - DailyAssignment da semana seguinte já gravada. Os pares que
 *   cruzam do domingo da semana validada para a semana seguinte (interjornada, descanso de 35h e
 *   sequência de dias) são apontados na última célula da semana validada.
 * @param {any[]} [input.absences]
 * @param {any[]} [input.coverageRules]
 * @param {{ defaultSundayRule?: string, weeklyHoursTarget?: number, minBreakMinutes?: number, sundayCycleOffset?: number }} [input.department]
 * @returns {ValidationResult}
 * @throws {Error} se weekStartDate não for segunda-feira ou algum turno tiver horário inválido
 */
export function validateSchedule({
  weekStartDate,
  employees = [],
  shifts = [],
  assignments = [],
  previousAssignments = [],
  earlierAssignments = [],
  nextAssignments = [],
  absences = [],
  coverageRules = [],
  department = {},
}) {
  if (!isMonday(weekStartDate)) throw new Error(`weekStartDate deve ser uma segunda-feira: ${weekStartDate}`);

  const dates = getWeekDates(weekStartDate);
  const earlierDateSet = new Set(getWeekDates(addDays(weekStartDate, -14)));
  // Domingos da semana retrasada, da anterior e da validada.
  const sundays = [addDays(weekStartDate, -8), addDays(weekStartDate, -1), dates[6]];
  const weekDateSet = new Set(dates);
  const nextDates = getWeekDates(addDays(weekStartDate, 7));
  const nextDateSet = new Set(nextDates);
  // Semana anterior + semana validada + semana seguinte (vazia quando não informada).
  const timelineDates = getWeekDates(addDays(weekStartDate, -7)).concat(dates, nextDates);
  const shiftById = new Map(shifts.map((s) => [s.id, s]));
  for (const shift of shifts) getShiftWindow(shift); // falha cedo em horário inválido
  const activeEmployees = employees.filter((e) => e.status !== 'INACTIVE');
  const activeIds = new Set(activeEmployees.map((e) => e.id));
  const currentAssignments = normalizeAssignments(assignments).filter((a) => activeIds.has(a.employeeId));
  const pastAssignments = normalizeAssignments(previousAssignments).filter((a) => activeIds.has(a.employeeId));
  const futureAssignments = normalizeAssignments(nextAssignments).filter(
    (a) => activeIds.has(a.employeeId) && nextDateSet.has(a.date),
  );
  const olderAssignments = normalizeAssignments(earlierAssignments).filter(
    (a) => activeIds.has(a.employeeId) && earlierDateSet.has(a.date),
  );

  const weeklyLimit = getWeeklyHoursLimit(weekStartDate, department);
  const minBreak = Math.min(60, Math.max(30, Number(department?.minBreakMinutes) || 60));
  const cycleOffset = Number(department?.sundayCycleOffset) || 0;

  /** @type {Map<string, Map<string, any>>} colaborador → data → atribuição */
  const cellsByEmployee = new Map();
  for (const a of [...olderAssignments, ...pastAssignments, ...currentAssignments, ...futureAssignments]) {
    if (!cellsByEmployee.has(a.employeeId)) cellsByEmployee.set(a.employeeId, new Map());
    cellsByEmployee.get(a.employeeId).set(a.date, a);
  }

  /** @type {Issue[]} */
  const issues = [];
  const push = (issue) => issues.push({ employeeId: undefined, date: null, details: {}, ...issue });

  for (const employee of activeEmployees) {
    const cells = cellsByEmployee.get(employee.id) ?? new Map();
    const isWork = (date) => cells.get(date)?.type === 'WORK';
    const absenceMap = getEmployeeAbsences(employee, absences, dates);
    for (const date of dates) {
      if (cells.get(date)?.type === 'ABSENCE' && !absenceMap.has(date)) absenceMap.set(date, 'OTHER');
    }
    const workDates = dates.filter(isWork);

    // Modelo 5x2. Atestado/outras ausências ocupam dias de trabalho, então as 2 folgas
    // continuam devidas; em semanas com férias, exige-se apenas no máximo 5 dias de trabalho.
    const workCount = workDates.length;
    const absenceDays = absenceMap.size;
    const hasVacation = [...absenceMap.values()].includes('VACATION');
    const offDays = dates.filter((d) => !isWork(d) && !absenceMap.has(d)).length;
    const expectedOff = Math.min(OFF_DAYS_PER_WEEK, 7 - absenceDays);
    const offViolation = hasVacation ? workCount > WORK_DAYS_PER_WEEK : offDays !== expectedOff;
    if (offViolation) {
      const absenceText = absenceDays ? `, ${absenceDays} dia(s) de ausência` : '';
      push({
        code: ISSUE_CODES.WEEKLY_OFF_COUNT,
        severity: SEVERITY.RED,
        employeeId: employee.id,
        message: `${employee.name}: ${workCount} dia(s) de trabalho e ${offDays} folga(s)${absenceText} na semana (5x2 exige ${expectedOff} folga(s)).`,
        details: { workDays: workCount, offDays, absenceDays, expectedOffDays: expectedOff },
      });
    }

    // Escalado em dia de férias/atestado.
    for (const date of workDates) {
      if (!absenceMap.has(date)) continue;
      push({
        code: ISSUE_CODES.ABSENCE_CONFLICT,
        severity: SEVERITY.RED,
        employeeId: employee.id,
        date,
        message: `${employee.name} está afastado(a) em ${formatDateBR(date)} e foi escalado(a).`,
      });
    }

    // Mais de 6 dias seguidos, considerando a semana anterior e a seguinte (OJ 410 SDI-1/TST).
    // Sequência que só estoura na semana seguinte é apontada no domingo da semana validada.
    const lastDate = dates[6];
    let streak = 0;
    let reported = false;
    for (const date of timelineDates) {
      if (!isWork(date)) {
        streak = 0;
        reported = false;
        continue;
      }
      streak += 1;
      if (streak <= MAX_CONSECUTIVE_WORK_DAYS || reported) continue;
      if (weekDateSet.has(date)) {
        reported = true;
        push({
          code: ISSUE_CODES.CONSECUTIVE_DAYS,
          severity: SEVERITY.RED,
          employeeId: employee.id,
          date,
          message: `${employee.name}: ${streak}º dia seguido de trabalho em ${formatDateBR(date)} (máximo 6, OJ 410 TST).`,
          details: { consecutiveDays: streak },
        });
      } else if (nextDateSet.has(date) && isWork(lastDate)) {
        // A sequência é contínua até aqui, então o domingo da semana validada faz parte dela.
        reported = true;
        push({
          code: ISSUE_CODES.CONSECUTIVE_DAYS,
          severity: SEVERITY.RED,
          employeeId: employee.id,
          date: lastDate,
          message: `${employee.name}: com a semana seguinte, a sequência a partir de ${formatDateBR(lastDate)} chega ao ${streak}º dia seguido em ${formatDateBR(date)} (máximo 6, OJ 410 TST).`,
          details: { consecutiveDays: streak, nextWeekDate: date },
        });
      }
    }

    // Descanso entre jornadas: 11h entre dias seguidos (art. 66 CLT) e 35h quando há
    // folga no meio (Súmula 110 TST: 24h de repouso semanal + 11h de interjornada).
    // O par que cruza para a semana seguinte é apontado na célula da semana validada.
    let previous = null;
    for (const date of timelineDates) {
      const cell = cells.get(date);
      if (cell?.type !== 'WORK' || !shiftById.has(cell.shiftId)) continue;
      const window = getShiftWindow(shiftById.get(cell.shiftId));
      const base = diffDays(weekStartDate, date) * 1440;
      const current = { date, start: base + window.start, end: base + window.end };
      const crossesIntoNextWeek = Boolean(previous) && nextDateSet.has(date) && weekDateSet.has(previous.date);
      if (previous && (weekDateSet.has(date) || crossesIntoNextWeek)) {
        const restMinutes = current.start - previous.end;
        const between = [];
        for (let d = addDays(previous.date, 1); d < date; d = addDays(d, 1)) between.push(d);
        const hasDayOff = between.some((d) => !cells.has(d) || cells.get(d).type === 'OFF');
        const required = hasDayOff ? MIN_WEEKLY_REST_MINUTES : MIN_INTERJORNADA_MINUTES;
        if (restMinutes < required) {
          const prevBR = formatDateBR(previous.date);
          const dateBR = formatDateBR(date);
          let message;
          if (crossesIntoNextWeek) {
            message =
              restMinutes < 0
                ? `${employee.name}: o turno de ${dateBR} (semana seguinte) começa antes do fim do turno de ${prevBR}.`
                : hasDayOff
                  ? `${employee.name}: descanso semanal de ${formatDuration(restMinutes)} entre ${prevBR} e o turno de ${dateBR} na semana seguinte (mínimo 35h, Súmula 110 TST).`
                  : `${employee.name}: descanso de ${formatDuration(restMinutes)} entre o turno de ${prevBR} e o de ${dateBR} na semana seguinte (mínimo 11h).`;
          } else {
            message =
              restMinutes < 0
                ? `${employee.name}: o turno de ${dateBR} começa antes do fim do turno anterior.`
                : hasDayOff
                  ? `${employee.name}: descanso semanal de ${formatDuration(restMinutes)} antes de ${dateBR} (mínimo 35h, Súmula 110 TST).`
                  : `${employee.name}: descanso de ${formatDuration(restMinutes)} antes do turno de ${dateBR} (mínimo 11h).`;
          }
          push({
            code: hasDayOff ? ISSUE_CODES.WEEKLY_REST : ISSUE_CODES.INTERJORNADA,
            severity: SEVERITY.RED,
            employeeId: employee.id,
            date: crossesIntoNextWeek ? previous.date : date,
            message,
            details: crossesIntoNextWeek
              ? { restMinutes, requiredMinutes: required, previousDate: previous.date, nextWeekDate: date }
              : { restMinutes, requiredMinutes: required, previousDate: previous.date },
          });
        }
      }
      previous = current;
    }

    // Intrajornada (art. 71 CLT) e limite diário de 10h (art. 59 CLT).
    let weeklyLegalMinutes = 0;
    for (const date of workDates) {
      const shift = shiftById.get(cells.get(date).shiftId);
      if (!shift) continue;
      const shiftWindow = getShiftWindow(shift);
      const presenceMinutes = shiftWindow.end - shiftWindow.start;
      const workMinutes = getShiftWorkMinutes(shift);
      const legalMinutes = getShiftLegalMinutes(shift);
      weeklyLegalMinutes += legalMinutes;
      const breakMinutes = shift.breakDurationMinutes ?? 0;
      const requiredBreak = getRequiredBreakMinutes(workMinutes, minBreak);
      if (breakMinutes < requiredBreak) {
        push({
          code: ISSUE_CODES.INTRAJORNADA,
          severity: SEVERITY.RED,
          employeeId: employee.id,
          date,
          message: `${employee.name}: intervalo de ${breakMinutes} min no turno de ${formatDateBR(date)} (mínimo ${requiredBreak} min, art. 71 CLT).`,
          details: { breakMinutes, requiredBreakMinutes: requiredBreak, shiftId: shift.id },
        });
      }
      if (breakMinutes > MAX_BREAK_MINUTES) {
        push({
          code: ISSUE_CODES.INTRAJORNADA,
          severity: SEVERITY.RED,
          employeeId: employee.id,
          date,
          message: `${employee.name}: intervalo de ${breakMinutes} min no turno de ${formatDateBR(date)} (máximo ${MAX_BREAK_MINUTES} min, art. 71 CLT).`,
          details: { breakMinutes, maxBreakMinutes: MAX_BREAK_MINUTES, shiftId: shift.id },
        });
      }
      if (presenceMinutes > MAX_SHIFT_PRESENCE_MINUTES) {
        push({
          code: ISSUE_CODES.INTRAJORNADA,
          severity: SEVERITY.RED,
          employeeId: employee.id,
          date,
          message: `${employee.name}: ${formatDuration(presenceMinutes)} entre entrada e saída no turno de ${formatDateBR(date)} (máximo 12h com o intervalo).`,
          details: { presenceMinutes, maxPresenceMinutes: MAX_SHIFT_PRESENCE_MINUTES, shiftId: shift.id },
        });
      }
      if (legalMinutes > MAX_DAILY_WORK_MINUTES) {
        const prorogatedNightMinutes = getShiftProrogatedNightMinutes(shift);
        const nightNote = prorogatedNightMinutes
          ? `, com hora noturna reduzida inclusive após as 05h, Súmula 60, II, TST`
          : '';
        push({
          code: ISSUE_CODES.DAILY_HOURS,
          severity: SEVERITY.RED,
          employeeId: employee.id,
          date,
          message: `${employee.name}: jornada de ${formatDuration(legalMinutes)} em ${formatDateBR(date)} (máximo 10h com horas extras${nightNote}).`,
          details: { legalMinutes, prorogatedNightMinutes, shiftId: shift.id },
        });
      }
    }

    // Carga horária semanal acima de min(meta do setor, teto legal da data), com hora noturna reduzida.
    if (weeklyLegalMinutes > weeklyLimit.minutes) {
      push({
        code: ISSUE_CODES.WEEKLY_HOURS,
        severity: SEVERITY.RED,
        employeeId: employee.id,
        message: `${employee.name}: ${formatDuration(weeklyLegalMinutes)} na semana (${describeWeeklyLimit(weeklyLimit)}).`,
        details: {
          workedMinutes: weeklyLegalMinutes,
          targetMinutes: weeklyLimit.minutes,
          legalCapMinutes: weeklyLimit.legalCap.hours * 60,
          limitSource: weeklyLimit.source,
        },
      });
    }

    // Repouso no domingo ao menos uma vez a cada 3 semanas (Lei 10.101/2000, art. 6º).
    // Só alerta com as três células conhecidas: sem histórico, não há informação.
    if (sundays.every(isWork)) {
      push({
        code: ISSUE_CODES.SUNDAY_LAW,
        severity: SEVERITY.RED,
        employeeId: employee.id,
        date: sundays[2],
        message: `${employee.name}: 3º domingo seguido de trabalho (${sundays.map(formatDateBR).join(', ')}); o repouso deve cair no domingo ao menos uma vez a cada 3 semanas (Lei 10.101/2000, art. 6º).`,
        details: { sundays, maxConsecutiveSundays: MAX_CONSECUTIVE_WORKED_SUNDAYS },
      });
    }

    // Rodízio de domingo (ciclo configurado no setor).
    const sunday = dates[6];
    if (isWork(sunday) && employee.sundayGroup) {
      const rule = resolveSundayRule(employee, department);
      if (isSundayOffWeek(employee.sundayGroup, rule, weekStartDate, cycleOffset) === true) {
        push({
          code: ISSUE_CODES.SUNDAY_ROTATION,
          severity: SEVERITY.YELLOW,
          employeeId: employee.id,
          date: sunday,
          message: `${employee.name} deveria folgar neste domingo pelo rodízio configurado (grupo ${employee.sundayGroup}).`,
          details: { sundayGroup: employee.sundayGroup, rule },
        });
      }
    }

    // Restrições individuais (dias ou turnos indisponíveis).
    const { unavailableDays = [], unavailableShiftIds = [] } = employee.fixedConstraints ?? {};
    for (const date of workDates) {
      const dayOfWeek = getDayOfWeek(date);
      const shiftId = cells.get(date).shiftId;
      if (!unavailableDays.includes(dayOfWeek) && !unavailableShiftIds.includes(shiftId)) continue;
      push({
        code: ISSUE_CODES.RESTRICTION,
        severity: SEVERITY.YELLOW,
        employeeId: employee.id,
        date,
        message: `${employee.name} tem restrição para ${formatDateBR(date)} neste turno.`,
        details: { dayOfWeek, shiftId },
      });
    }
  }

  // Cobertura do dia: total de pessoas, tags obrigatórias e picos de horário.
  const employeeById = new Map(activeEmployees.map((e) => [e.id, e]));
  const byDate = groupByDate([...pastAssignments, ...currentAssignments]);
  for (const date of dates) {
    const rule = getCoverageRuleForDay(coverageRules, getDayOfWeek(date));
    if (!rule) continue;
    const working = (byDate.get(date) ?? []).filter((a) => a.type === 'WORK').map((a) => employeeById.get(a.employeeId));

    if (working.length < rule.minTotalStaff) {
      push({
        code: ISSUE_CODES.COVERAGE_GAP,
        severity: SEVERITY.YELLOW,
        date,
        message: `${formatDateBR(date)}: ${working.length} pessoa(s) escalada(s), meta mínima ${rule.minTotalStaff}.`,
        details: { required: rule.minTotalStaff, actual: working.length },
      });
    }

    for (const { tag, minCount } of rule.requiredTags) {
      const actual = working.filter((e) => e.tags?.includes(tag)).length;
      if (actual < minCount) {
        push({
          code: ISSUE_CODES.MISSING_TAG,
          severity: SEVERITY.YELLOW,
          date,
          message: `${formatDateBR(date)}: ${actual} pessoa(s) com a tag "${tag}", mínimo ${minCount}.`,
          details: { tag, required: minCount, actual },
        });
      }
    }

    const windows = getActiveWindows(byDate, shiftById, date);
    for (const peak of rule.peakHours) {
      const start = timeToMinutes(peak.start);
      let end = timeToMinutes(peak.end);
      if (end <= start) end += 1440;
      // Amostra o início do pico, cada hora cheia e cada entrada/saída de turno dentro dele.
      const instants = new Set([start]);
      for (let m = Math.floor(start / 60) * 60 + 60; m < end; m += 60) instants.add(m);
      for (const w of windows) {
        if (w.start > start && w.start < end) instants.add(w.start);
        if (w.end > start && w.end < end) instants.add(w.end);
      }
      let worst = { minute: start, count: Infinity };
      for (const minute of [...instants].sort((a, b) => a - b)) {
        const count = countActiveAt(windows, minute);
        if (count < worst.count) worst = { minute, count };
      }
      if (worst.count < peak.minStaff) {
        push({
          code: ISSUE_CODES.PEAK_COVERAGE,
          severity: SEVERITY.YELLOW,
          date,
          message: `${formatDateBR(date)}: pico ${peak.start}–${peak.end} com ${worst.count} pessoa(s), mínimo ${peak.minStaff}.`,
          details: { start: peak.start, end: peak.end, required: peak.minStaff, actual: worst.count, atMinute: worst.minute },
        });
      }
    }
  }

  return buildResult(issues);
}

/** @param {Issue[]} issues @returns {ValidationResult} */
function buildResult(issues) {
  const issuesByEmployee = {};
  const issuesByCell = {};
  const issuesByDate = {};
  let red = 0;
  let yellow = 0;
  for (const issue of issues) {
    if (issue.severity === SEVERITY.RED) red += 1;
    else yellow += 1;
    if (issue.employeeId) {
      (issuesByEmployee[issue.employeeId] ??= []).push(issue);
      if (issue.date) (issuesByCell[`${issue.employeeId}|${issue.date}`] ??= []).push(issue);
    } else if (issue.date) {
      (issuesByDate[issue.date] ??= []).push(issue);
    }
  }
  return {
    issues,
    summary: { red, yellow, total: red + yellow },
    status: red > 0 ? 'RED' : yellow > 0 ? 'YELLOW' : 'GREEN',
    issuesByEmployee,
    issuesByCell,
    issuesByDate,
  };
}

/**
 * Alertas de uma célula da grade (colaborador × dia).
 * @param {ValidationResult} result
 * @param {string} employeeId
 * @param {string} date
 * @returns {Issue[]}
 */
export function getCellIssues(result, employeeId, date) {
  return result.issuesByCell[`${employeeId}|${date}`] ?? [];
}
