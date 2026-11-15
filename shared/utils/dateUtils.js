/**
 * Utilitários de data para escalas semanais.
 * Datas são strings 'YYYY-MM-DD' tratadas em UTC, para não depender do fuso do dispositivo.
 * Módulo puro, compartilhado entre web e api.
 */

import { DAYS_OF_WEEK } from '../models/schemas.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Segunda-feira usada como semana 0 na numeração contínua de semanas. */
const EPOCH_MONDAY = '1970-01-05';

/**
 * Normaliza datas vindas da API/banco ('2026-11-18T00:00:00.000Z') para 'YYYY-MM-DD'.
 * @param {string} value
 * @returns {string}
 */
export function toDateKey(value) {
  return String(value).slice(0, 10);
}

/**
 * @param {string} date - 'YYYY-MM-DD'
 * @returns {number} milissegundos UTC à meia-noite da data
 */
export function parseDate(date) {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * @param {number} ms - milissegundos UTC
 * @returns {string} 'YYYY-MM-DD'
 */
export function formatDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * @param {string} date
 * @param {number} days
 * @returns {string}
 */
export function addDays(date, days) {
  return formatDate(parseDate(date) + days * MS_PER_DAY);
}

/**
 * Quantidade de dias de `from` até `to` (negativo se `to` for anterior).
 * @param {string} from
 * @param {string} to
 * @returns {number}
 */
export function diffDays(from, to) {
  return Math.round((parseDate(to) - parseDate(from)) / MS_PER_DAY);
}

/**
 * @param {string} date
 * @returns {import('../models/schemas.js').DayOfWeek}
 */
export function getDayOfWeek(date) {
  // getUTCDay: 0 = domingo; DAYS_OF_WEEK começa na segunda.
  const jsDay = new Date(parseDate(date)).getUTCDay();
  return /** @type {any} */ (DAYS_OF_WEEK[(jsDay + 6) % 7]);
}

/**
 * @param {string} date
 * @returns {boolean}
 */
export function isMonday(date) {
  return getDayOfWeek(date) === 'SEG';
}

/**
 * As 7 datas da semana, de segunda a domingo.
 * @param {string} weekStartDate - segunda-feira
 * @returns {string[]}
 */
export function getWeekDates(weekStartDate) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStartDate, i));
}

/**
 * Número contínuo da semana (0 = semana de 05/01/1970). Base dos rodízios de domingo.
 * @param {string} weekStartDate
 * @returns {number}
 */
export function getWeekIndex(weekStartDate) {
  return Math.floor(diffDays(EPOCH_MONDAY, weekStartDate) / 7);
}

/**
 * Semana do ciclo de 3 semanas (ScheduleCycle.cycleWeek). No rodízio 1 em 3,
 * o grupo de domingo igual ao cycleWeek é o que folga no domingo. Só tem significado
 * no rodízio 1 em 3; no 1 em 2 vale a paridade da semana.
 * @param {string} weekStartDate
 * @param {number} [cycleOffset=0] - deslocamento do ciclo do setor (department.sundayCycleOffset)
 * @returns {1 | 2 | 3}
 */
export function getCycleWeek(weekStartDate, cycleOffset = 0) {
  const index = getWeekIndex(weekStartDate) + cycleOffset;
  return /** @type {1 | 2 | 3} */ ((((index % 3) + 3) % 3) + 1);
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * @param {string} time - 'HH:MM' (00:00 a 23:59)
 * @returns {number} minutos desde 00:00
 * @throws {Error} se o horário não estiver no formato 'HH:MM'
 */
export function timeToMinutes(time) {
  if (typeof time !== 'string' || !TIME_PATTERN.test(time)) {
    throw new Error(`Horário inválido: "${time}" (use HH:MM).`);
  }
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * @param {number} minutes - minutos desde 00:00 (aceita valores ≥ 1440)
 * @returns {string} 'HH:MM'
 */
export function minutesToTime(minutes) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const h = String(Math.floor(normalized / 60)).padStart(2, '0');
  const m = String(normalized % 60).padStart(2, '0');
  return `${h}:${m}`;
}
