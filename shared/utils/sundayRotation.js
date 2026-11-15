/**
 * Rodízio de domingos (spec, módulos 2 e 3).
 * Módulo puro, compartilhado entre web e api.
 */

import { getWeekIndex } from './dateUtils.js';

/**
 * Distribui os colaboradores em grupos de domingo por aritmética modular (i mod n + 1),
 * mantendo ⌊N/n⌋ ou ⌈N/n⌉ pessoas por grupo.
 * @param {Array<{ id: string }>} employees - colaboradores ativos, na ordem desejada
 * @param {number} [groupCount=3] - 3 para o rodízio 1 em 3, 2 para 1 em 2
 * @returns {Record<string, number>} id do colaborador → grupo (1..groupCount)
 */
export function assignSundayGroups(employees, groupCount = 3) {
  /** @type {Record<string, number>} */
  const groups = {};
  employees.forEach((employee, i) => {
    groups[employee.id] = (i % groupCount) + 1;
  });
  return groups;
}

/**
 * Regra de rodízio efetiva: a individual do colaborador prevalece sobre a do setor.
 * @param {{ customSundayRule?: string }} employee
 * @param {{ defaultSundayRule?: string } | undefined} department
 * @returns {string}
 */
export function resolveSundayRule(employee, department) {
  return employee?.customSundayRule ?? department?.defaultSundayRule ?? '1_IN_3';
}

/**
 * Quantidade de grupos de domingo adequada à regra (1_IN_2 → 2; demais → 3).
 * @param {string} rule
 * @returns {number}
 */
export function getSundayGroupCount(rule) {
  return rule === '1_IN_2' ? 2 : 3;
}

/**
 * Indica se o grupo deve folgar no domingo da semana informada, pelo ciclo configurado.
 * - 1_IN_3: cada grupo (1, 2, 3) folga um domingo a cada 3 semanas.
 * - 1_IN_2: grupos ímpares e pares alternam (o grupo 3 segue o grupo 1; use
 *   getSundayGroupCount para distribuir em 2 grupos nesse modo).
 * - CUSTOM ou regra desconhecida: retorna null (não verificado).
 * @param {number} sundayGroup
 * @param {string} rule
 * @param {string} weekStartDate
 * @param {number} [cycleOffset=0] - alinha o ciclo de uma loja que já estava no meio do rodízio
 * @returns {boolean | null}
 */
export function isSundayOffWeek(sundayGroup, rule, weekStartDate, cycleOffset = 0) {
  const weekIndex = getWeekIndex(weekStartDate) + cycleOffset;
  const mod = (n, m) => ((n % m) + m) % m;
  if (rule === '1_IN_3') return mod(weekIndex, 3) === mod(sundayGroup - 1, 3);
  if (rule === '1_IN_2') return mod(weekIndex, 2) === mod(sundayGroup - 1, 2);
  return null;
}
