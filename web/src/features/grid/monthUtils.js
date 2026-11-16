/** Utilidades da visualização mensal (rótulos, descrição de célula e consolidação de alertas). */

import { addDays } from '@escala/shared/utils/dateUtils.js';
import { formatDM, shiftLabel } from './gridUtils.js';

export const MONTH_NAMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const WEEKDAY_CAPS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];

/** @param {string} monthKey 'YYYY-MM' -> 'novembro' */
export const monthName = (monthKey) => MONTH_NAMES[Number(monthKey.slice(5, 7)) - 1];

/** @param {string} monthKey 'YYYY-MM' -> 'novembro de 2026' */
export const formatMonthLabel = (monthKey) => `${monthName(monthKey)} de ${monthKey.slice(0, 4)}`;

/** Mês de hoje no fuso local, 'YYYY-MM'. */
export function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Hoje no fuso local, 'YYYY-MM-DD'. */
export function todayDateKey() {
  return `${currentMonthKey()}-${String(new Date().getDate()).padStart(2, '0')}`;
}

/**
 * Resumo das semanas que tocam o mês, para os textos de confirmação.
 * @param {string} monthKey
 * @param {string[]} weeks - segundas-feiras
 * @returns {{ count: number, range: string, outside: string }} outside: "outubro/dezembro" ou ''
 */
export function describeMonthWeeks(monthKey, weeks) {
  const from = weeks[0];
  const to = addDays(weeks[weeks.length - 1], 6);
  const outside = [from, to].filter((d) => d.slice(0, 7) !== monthKey).map((d) => monthName(d.slice(0, 7)));
  return { count: weeks.length, range: `${formatDM(from)} a ${formatDM(to)}`, outside: [...new Set(outside)].join('/') };
}

/** Descrição curta do conteúdo de uma célula, para rótulos acessíveis. */
export function describeCell(cell, shift) {
  if (cell?.type === 'WORK' && shift) return `${shiftLabel(shift)}${shift.code ? ` ${shift.name}` : ''} ${shift.startTime}–${shift.endTime}`;
  if (cell?.type === 'WORK') return 'Turno removido';
  if (cell?.type === 'OFF') return 'Folga';
  if (cell?.type === 'ABSENCE') return 'Ausente';
  return 'sem escala';
}

const EMPTY_ISSUES = Object.freeze({
  issuesByCell: {},
  issuesByDate: {},
  counts: new Map(),
  weekGroups: [],
});

/**
 * Consolida a validação das semanas do mês.
 * Os alertas da virada para a semana seguinte (`details.nextWeekDate`) dentro do mês são
 * descartados da lista, como em `summarize` do módulo compartilhado: a semana seguinte
 * aponta o mesmo par olhando para trás.
 * @param {import('@escala/shared/utils/monthSchedule.js').MonthValidation | null} validation
 * @returns {{
 *   issuesByCell: Record<string, any[]>,
 *   issuesByDate: Record<string, any[]>,
 *   counts: Map<string, { red: number, yellow: number }>,
 *   weekGroups: { weekStart: string, issues: any[] }[],
 * }}
 */
export function buildMonthIssues(validation) {
  if (!validation) return EMPTY_ISSUES;
  const lastIndex = validation.weeks.length - 1;
  const issuesByCell = {};
  const issuesByDate = {};
  const counts = new Map();
  const weekGroups = validation.weeks.map(({ weekStartDate, validation: v }, index) => {
    Object.assign(issuesByCell, v.issuesByCell);
    Object.assign(issuesByDate, v.issuesByDate);
    const issues = v.issues.filter((issue) => !(index < lastIndex && issue.details?.nextWeekDate));
    for (const issue of issues) {
      if (!issue.employeeId) continue;
      const entry = counts.get(issue.employeeId) ?? { red: 0, yellow: 0 };
      if (issue.severity === 'RED') entry.red += 1;
      else entry.yellow += 1;
      counts.set(issue.employeeId, entry);
    }
    return { weekStart: weekStartDate, issues };
  });
  return { issuesByCell, issuesByDate, counts, weekGroups };
}

/** Texto "1 alerta vermelho" etc. de uma lista de alertas de uma célula. */
export function splitSeverity(issues) {
  const red = issues.filter((i) => i.severity === 'RED').length;
  return { red, yellow: issues.length - red, text: issues.map((i) => i.message).join('\n') };
}
