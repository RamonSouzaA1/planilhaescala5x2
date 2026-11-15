/**
 * Textos para WhatsApp (spec 5, módulo 7, e 6.5). Funções puras, sem DOM.
 * Formato WhatsApp: *negrito*, quebras de linha simples.
 */
import { addDays, getWeekDates } from '@escala/shared/utils/dateUtils.js';
import { isSundayOffWeek, resolveSundayRule } from '@escala/shared/utils/sundayRotation.js';

export const SITE_URL = 'https://planilhaescala5x2.com.br';
export const SITE_LABEL = 'planilhaescala5x2.com.br';
export const VIRAL_FOOTER = `Escala 5x2 gerada em 30s sem erro de CLT — Crie a do seu setor grátis em ${SITE_LABEL}`;

export const DAY_NAMES = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
export const DAY_SHORT = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];

/** 'YYYY-MM-DD' → 'DD/MM' */
export function shortDate(date) {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

/** Intervalo da semana: '16/11 a 22/11'. */
export function weekRangeLabel(weekStartDate) {
  return `${shortDate(weekStartDate)} a ${shortDate(addDays(weekStartDate, 6))}`;
}

function shiftTime(shift) {
  return `${shift.startTime}–${shift.endTime}`;
}

function indexCells(assignments) {
  return new Map(assignments.map((a) => [`${a.employeeId}|${a.date}`, a]));
}

/**
 * Resumo da equipe para colar no grupo.
 * @param {{ department: any, weekStartDate: string, employees: any[], shifts: any[], assignments: any[], plan?: string }} input
 * @returns {string}
 */
export function buildTeamSummary({ department, weekStartDate, employees, shifts, assignments, plan = 'FREE' }) {
  const cells = indexCells(assignments);
  const shiftById = new Map(shifts.map((s) => [s.id, s]));
  const dates = getWeekDates(weekStartDate);
  const title = department?.name ? `Escala ${department.name}` : 'Escala';
  const lines = [`*${title} — ${weekRangeLabel(weekStartDate)}*`];

  dates.forEach((date, i) => {
    lines.push('', `*${DAY_NAMES[i]} ${shortDate(date)}*`);
    const byShift = new Map();
    const off = [];
    for (const employee of employees) {
      const cell = cells.get(`${employee.id}|${date}`);
      if (cell?.type === 'WORK' && shiftById.has(cell.shiftId)) {
        if (!byShift.has(cell.shiftId)) byShift.set(cell.shiftId, []);
        byShift.get(cell.shiftId).push(employee.name);
      } else if (cell?.type === 'ABSENCE') {
        off.push(`${employee.name} (ausente)`);
      } else {
        off.push(employee.name);
      }
    }
    for (const shift of shifts) {
      const names = byShift.get(shift.id);
      if (names?.length) lines.push(`${shift.code} ${shiftTime(shift)}: ${names.join(', ')}`);
    }
    lines.push(`Folga: ${off.length ? off.join(', ') : '—'}`);
  });

  if (plan === 'FREE') lines.push('', `_${VIRAL_FOOTER}_`);
  return lines.join('\n');
}

/**
 * Próximo domingo de folga do colaborador (a partir da semana informada), ou null.
 * Usa a escala da semana quando o domingo já está definido; senão, o rodízio do setor.
 */
export function nextSundayOff({ employee, department, weekStartDate, assignments }) {
  const sunday = addDays(weekStartDate, 6);
  const cell = assignments.find((a) => a.employeeId === employee.id && a.date === sunday);
  if (cell?.type === 'OFF') return sunday;
  const rule = resolveSundayRule(employee, department);
  for (let w = 1; w <= 6; w += 1) {
    const start = addDays(weekStartDate, 7 * w);
    if (isSundayOffWeek(employee.sundayGroup, rule, start) === true) return addDays(start, 6);
  }
  return null;
}

/**
 * Card individual do colaborador.
 * @param {{ employee: any, department?: any, weekStartDate: string, shifts: any[], assignments: any[], plan?: string }} input
 * @returns {string}
 */
export function buildEmployeeMessage({ employee, department, weekStartDate, shifts, assignments, plan = 'FREE' }) {
  const shiftById = new Map(shifts.map((s) => [s.id, s]));
  const cells = indexCells(assignments);
  const first = (employee.name ?? '').trim().split(/\s+/)[0] || 'tudo bem';
  const end = addDays(weekStartDate, 6);
  const lines = [`Olá, ${first}! Sua escala da semana ${shortDate(weekStartDate)}–${shortDate(end)}:`, ''];
  getWeekDates(weekStartDate).forEach((date, i) => {
    const cell = cells.get(`${employee.id}|${date}`);
    const shift = cell?.type === 'WORK' ? shiftById.get(cell.shiftId) : null;
    let what = 'FOLGA';
    if (shift) what = `${shift.code} ${shiftTime(shift)}`;
    else if (cell?.type === 'ABSENCE') what = 'AUSENTE';
    else if (cell?.type === 'WORK') what = 'Trabalho';
    lines.push(`*${DAY_SHORT[i]} ${shortDate(date)}:* ${what}`);
  });
  const sunday = nextSundayOff({ employee, department, weekStartDate, assignments });
  if (sunday) lines.push('', `Próximo domingo de folga: *${shortDate(sunday)}*`);
  if (plan === 'FREE') lines.push('', `_${VIRAL_FOOTER}_`);
  return lines.join('\n');
}

/** Só dígitos, com prefixo 55 quando faltar. Retorna '' se não houver dígitos. */
export function normalizePhone(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`;
}

/**
 * Link de compartilhamento do WhatsApp.
 * @param {string} text
 * @param {string} [phone]
 */
export function whatsappShareUrl(text, phone) {
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(text)}`;
}
