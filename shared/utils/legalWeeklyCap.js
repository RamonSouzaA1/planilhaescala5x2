/**
 * Teto legal da jornada semanal pela data (EC 141/2026, promulgada em 16/10/2026):
 *   - 44h até 14/12/2026 (art. 7º, XIII, CF, redação original);
 *   - 42h a partir de 15/12/2026 (60 dias após a publicação);
 *   - 40h a partir de 15/12/2027 (12 meses depois da primeira etapa).
 * Módulo puro, compartilhado entre web (configuração do setor) e api (validação da meta).
 * Reexportado por `cltValidator.js`.
 */

import { formatDate, parseDate, toDateKey } from './dateUtils.js';

/** Teto anterior à EC 141/2026. */
export const BASE_WEEKLY_CAP_HOURS = 44;

/** Etapas da redução, em ordem cronológica. `from` é o primeiro dia de vigência. */
export const LEGAL_WEEKLY_CAP_STEPS = Object.freeze([
  Object.freeze({ from: '2026-12-15', hours: 42 }),
  Object.freeze({ from: '2027-12-15', hours: 40 }),
]);

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param {unknown} date
 * @returns {string} 'YYYY-MM-DD'
 * @throws {Error} se a data for inválida
 */
function normalizeDate(date) {
  const key = typeof date === 'string' ? toDateKey(date) : '';
  if (!DATE_PATTERN.test(key) || formatDate(parseDate(key)) !== key) {
    throw new Error(`Data inválida para o teto legal: ${String(date)}`);
  }
  return key;
}

/**
 * Etapa do teto legal vigente na data, com o período de vigência.
 * @param {string} date - 'YYYY-MM-DD' (aceita ISO com horário)
 * @returns {{ hours: number, from: string | null, until: string | null }} `from`/`until` inclusivos;
 *   null quando o período é aberto
 * @throws {Error} se a data for inválida
 */
export function getLegalWeeklyCap(date) {
  const key = normalizeDate(date);
  let index = -1;
  LEGAL_WEEKLY_CAP_STEPS.forEach((step, i) => {
    if (key >= step.from) index = i;
  });
  const next = LEGAL_WEEKLY_CAP_STEPS[index + 1];
  const until = next ? formatDate(parseDate(next.from) - 24 * 60 * 60 * 1000) : null;
  if (index < 0) return { hours: BASE_WEEKLY_CAP_HOURS, from: null, until };
  const step = LEGAL_WEEKLY_CAP_STEPS[index];
  return { hours: step.hours, from: step.from, until };
}

/**
 * Teto legal semanal (horas) vigente na data. Para validar uma semana, use a `weekStartDate`.
 * @param {string} date - 'YYYY-MM-DD' (aceita ISO com horário)
 * @returns {number} 44, 42 ou 40
 * @throws {Error} se a data for inválida
 */
export function getLegalWeeklyCapHours(date) {
  return getLegalWeeklyCap(date).hours;
}
