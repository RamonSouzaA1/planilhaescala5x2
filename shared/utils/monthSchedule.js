/**
 * Escala do mês de calendário (F13). O 5x2 é semanal: o mês é gerado e validado como a
 * sequência das semanas inteiras (segunda a domingo) que tocam o mês, encadeando cada semana
 * na seguinte (virada de semana, OJ 410, interjornada e regra dos três domingos).
 * Os dias fora do mês fazem parte dessas semanas; a interface os mostra em cinza.
 * Módulo puro, compartilhado entre web e api.
 */

import { addDays, getDayOfWeek, getWeekDates, toDateKey } from './dateUtils.js';
import { DAYS_OF_WEEK } from '../models/schemas.js';
import { generateSchedule } from './scheduleGenerator.js';
import { validateSchedule } from './cltValidator.js';

const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])/;

/**
 * @typedef {Object} MonthWeek
 * @property {string} weekStartDate - segunda-feira da semana
 * @property {import('./cltValidator.js').ValidationResult} validation - validação da semana com o
 *   contexto encadeado (semana anterior, retrasada e seguinte)
 */

/**
 * @typedef {Object} MonthSummary
 * @property {number} red
 * @property {number} yellow
 * @property {number} total
 * @property {'RED' | 'YELLOW' | 'GREEN'} status
 */

/**
 * @typedef {Object} MonthValidation
 * @property {MonthWeek[]} weeks
 * @property {MonthSummary} summary - alertas do mês, contando uma vez só os da virada entre
 *   duas semanas do mês (cada uma das duas semanas mostra o alerta na própria célula)
 */

/**
 * @param {unknown} value
 * @returns {boolean} true se for 'YYYY-MM' com mês de 01 a 12
 */
export function isMonthKey(value) {
  return typeof value === 'string' && MONTH_KEY_PATTERN.test(value);
}

/** @param {unknown} monthKey @throws {Error} */
function assertMonthKey(monthKey) {
  if (!isMonthKey(monthKey)) throw new Error(`Mês inválido: "${monthKey}" (use YYYY-MM).`);
}

/** Segunda-feira da semana que contém a data. */
function mondayOf(date) {
  return addDays(date, -DAYS_OF_WEEK.indexOf(getDayOfWeek(date)));
}

/**
 * @param {string} date - 'YYYY-MM-DD' (aceita ISO completo vindo da API)
 * @returns {string} 'YYYY-MM'
 * @throws {Error} se não começar por uma data 'YYYY-MM-DD'
 */
export function getMonthKey(date) {
  if (typeof date !== 'string' || !DATE_KEY_PATTERN.test(date)) {
    throw new Error(`Data inválida: "${date}" (use YYYY-MM-DD).`);
  }
  return date.slice(0, 7);
}

/**
 * @param {string} monthKey - 'YYYY-MM'
 * @param {number} n - meses a somar (negativo volta)
 * @returns {string} 'YYYY-MM'
 */
export function addMonths(monthKey, n) {
  assertMonthKey(monthKey);
  const [year, month] = monthKey.split('-').map(Number);
  const index = year * 12 + (month - 1) + Math.trunc(Number(n) || 0);
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}`;
}

/**
 * Dias do mês, do dia 1 ao último.
 * @param {string} monthKey
 * @returns {string[]}
 */
export function getMonthDates(monthKey) {
  assertMonthKey(monthKey);
  const first = `${monthKey}-01`;
  const dates = [];
  for (let date = first; getMonthKey(date) === monthKey; date = addDays(date, 1)) dates.push(date);
  return dates;
}

/**
 * Segundas-feiras das semanas que tocam o mês: da semana do dia 1 até a do último dia (4 a 6).
 * @param {string} monthKey
 * @returns {string[]}
 */
export function getMonthWeeks(monthKey) {
  const dates = getMonthDates(monthKey);
  const last = mondayOf(dates[dates.length - 1]);
  const weeks = [];
  for (let monday = mondayOf(dates[0]); monday <= last; monday = addDays(monday, 7)) weeks.push(monday);
  return weeks;
}

/**
 * Todas as datas das semanas que tocam o mês, em ordem (grade do calendário mensal).
 * @param {string} monthKey
 * @returns {string[]}
 */
export function getMonthGridDates(monthKey) {
  return getMonthWeeks(monthKey).flatMap(getWeekDates);
}

/** Células com data normalizada, só nas datas da semana que começa em `weekStart`. */
function cellsInWeek(assignments, weekStart) {
  const dates = new Set(getWeekDates(weekStart));
  return assignments.map((a) => ({ ...a, date: toDateKey(a.date) })).filter((a) => dates.has(a.date));
}

/** Agrupa as células por segunda-feira da semana. */
function groupByWeek(assignments) {
  const byWeek = new Map();
  for (const a of assignments) {
    const date = toDateKey(a.date);
    const monday = mondayOf(date);
    if (!byWeek.has(monday)) byWeek.set(monday, []);
    byWeek.get(monday).push({ ...a, date });
  }
  return byWeek;
}

/**
 * Soma os alertas das semanas. Um alerta da virada para a semana seguinte (`details.nextWeekDate`)
 * só conta quando a semana seguinte está fora do mês: dentro do mês, a própria semana seguinte
 * aponta o mesmo par olhando para trás.
 * @param {MonthWeek[]} weeks
 * @returns {MonthSummary}
 */
function summarize(weeks) {
  const lastIndex = weeks.length - 1;
  let red = 0;
  let yellow = 0;
  weeks.forEach(({ validation }, index) => {
    for (const issue of validation.issues) {
      if (index < lastIndex && issue.details?.nextWeekDate) continue;
      if (issue.severity === 'RED') red += 1;
      else yellow += 1;
    }
  });
  return { red, yellow, total: red + yellow, status: red > 0 ? 'RED' : yellow > 0 ? 'YELLOW' : 'GREEN' };
}

/**
 * Valida cada semana com o contexto encadeado.
 * @param {string[]} weekStarts
 * @param {Map<string, any[]>} byWeek - células por segunda-feira (inclui retrasada, anterior e seguinte)
 * @param {Object} context - employees, shifts, absences, coverageRules, department
 * @returns {MonthValidation}
 */
function validateWeeks(weekStarts, byWeek, context) {
  const of = (monday) => byWeek.get(monday) ?? [];
  const weeks = weekStarts.map((weekStartDate) => ({
    weekStartDate,
    validation: validateSchedule({
      ...context,
      weekStartDate,
      assignments: of(weekStartDate),
      previousAssignments: of(addDays(weekStartDate, -7)),
      earlierAssignments: of(addDays(weekStartDate, -14)),
      nextAssignments: of(addDays(weekStartDate, 7)),
    }),
  }));
  return { weeks, summary: summarize(weeks) };
}

/**
 * Gera a escala do mês semana a semana, em ordem. A semana seguinte usa as anteriores já
 * geradas como `previousAssignments`/`earlierAssignments`; as células travadas da semana
 * seguinte do mês entram como `nextAssignments` (descanso e sequência até elas) e, na última
 * semana, vale o `nextAssignments` recebido. Depois, cada semana é validada com o contexto final.
 * @param {Object} input
 * @param {string} input.monthKey - 'YYYY-MM'
 * @param {any[]} input.employees
 * @param {any[]} [input.shifts]
 * @param {any[]} [input.previousAssignments] - semana anterior à primeira semana do mês
 * @param {any[]} [input.earlierAssignments] - semana retrasada à primeira semana do mês
 * @param {any[]} [input.nextAssignments] - semana seguinte à última semana do mês, já gravada
 * @param {any[]} [input.existingAssignments] - células das semanas do mês; só as isPinned são preservadas
 * @param {any[]} [input.absences]
 * @param {any[]} [input.coverageRules]
 * @param {Object} [input.department]
 * @param {string[]} [input.peakDates]
 * @returns {{ assignments: any[] } & MonthValidation} assignments: semanas inteiras, em ordem de semana
 * @throws {Error} se monthKey for inválido ou algum turno tiver horário inválido
 */
export function generateMonth({
  monthKey,
  employees = [],
  shifts = [],
  previousAssignments = [],
  earlierAssignments = [],
  nextAssignments = [],
  existingAssignments = [],
  absences = [],
  coverageRules = [],
  department = {},
  peakDates = [],
}) {
  const weekStarts = getMonthWeeks(monthKey);
  const firstWeek = weekStarts[0];
  const afterLast = addDays(weekStarts[weekStarts.length - 1], 7);
  const pinned = existingAssignments.filter((a) => a.isPinned);
  const context = { employees, shifts, absences, coverageRules, department };

  // Contexto por semana: retrasada e anterior à primeira, as semanas geradas e a seguinte ao mês.
  const byWeek = new Map([
    [addDays(firstWeek, -14), cellsInWeek(earlierAssignments, addDays(firstWeek, -14))],
    [addDays(firstWeek, -7), cellsInWeek(previousAssignments, addDays(firstWeek, -7))],
    [afterLast, cellsInWeek(nextAssignments, afterLast)],
  ]);

  weekStarts.forEach((weekStartDate, index) => {
    const isLast = index === weekStarts.length - 1;
    const following = addDays(weekStartDate, 7);
    const { assignments } = generateSchedule({
      ...context,
      weekStartDate,
      peakDates,
      previousAssignments: byWeek.get(addDays(weekStartDate, -7)),
      earlierAssignments: byWeek.get(addDays(weekStartDate, -14)),
      nextAssignments: isLast ? byWeek.get(afterLast) : cellsInWeek(pinned, following),
      existingAssignments: cellsInWeek(pinned, weekStartDate),
    });
    byWeek.set(weekStartDate, assignments);
  });

  return {
    assignments: weekStarts.flatMap((monday) => byWeek.get(monday)),
    ...validateWeeks(weekStarts, byWeek, context),
  };
}

/**
 * Valida as semanas do mês a partir de um conjunto de células. A semana anterior, a retrasada
 * e a seguinte de cada semana são retiradas do próprio conjunto (inclusive fora do mês).
 * @param {Object} input
 * @param {string} input.monthKey - 'YYYY-MM'
 * @param {any[]} input.employees
 * @param {any[]} [input.shifts]
 * @param {any[]} [input.assignments] - células do setor (pode incluir outras semanas)
 * @param {any[]} [input.absences]
 * @param {any[]} [input.coverageRules]
 * @param {Object} [input.department]
 * @returns {MonthValidation}
 * @throws {Error} se monthKey for inválido
 */
export function validateMonth({
  monthKey,
  employees = [],
  shifts = [],
  assignments = [],
  absences = [],
  coverageRules = [],
  department = {},
}) {
  const weekStarts = getMonthWeeks(monthKey);
  const first = addDays(weekStarts[0], -14);
  const end = addDays(weekStarts[weekStarts.length - 1], 13);
  const relevant = assignments.filter((a) => {
    const date = toDateKey(a.date);
    return date >= first && date <= end;
  });
  return validateWeeks(weekStarts, groupByWeek(relevant), { employees, shifts, absences, coverageRules, department });
}
