/** Fuso usado nas regras que dependem da data de hoje (portal e teto legal da meta semanal). */
export const TIMEZONE = 'America/Sao_Paulo';

/**
 * Data de hoje (YYYY-MM-DD) no fuso de Brasília.
 * @param {Date} now
 * @returns {string}
 */
export function todayInBrazil(now) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(now);
}
