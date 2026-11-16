import {
  getLegalWeeklyCap,
  getRequiredBreakMinutes,
  getShiftLegalMinutes,
  getShiftNightMinutes,
  getShiftWindow,
  getShiftWorkMinutes,
  LEGAL_WEEKLY_CAP_STEPS,
} from '@escala/shared/utils/cltValidator.js';

/** Hoje (data local do dispositivo) como 'YYYY-MM-DD'. */
export function todayLocalDate() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 'YYYY-MM-DD' → 'DD/MM/AAAA'. */
const toBR = (date) => date.split('-').reverse().join('/');

/**
 * Texto do teto legal semanal vigente na data e da próxima etapa (EC 141/2026).
 * @param {string} date - 'YYYY-MM-DD'
 * @returns {string}
 */
export function describeLegalWeeklyCap(date) {
  const cap = getLegalWeeklyCap(date);
  const period = cap.from && cap.until ? `de ${toBR(cap.from)} a ${toBR(cap.until)}` : cap.from ? `desde ${toBR(cap.from)}` : `até ${toBR(cap.until)}`;
  const next = LEGAL_WEEKLY_CAP_STEPS.find((step) => step.from > date);
  const nextText = next ? ` Próxima etapa: ${next.hours}h a partir de ${toBR(next.from)}.` : '';
  return `Teto legal vigente: ${cap.hours}h semanais (${period}).${nextText} Base: EC 141/2026.`;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** @param {string} t @returns {boolean} 'HH:MM' válido */
export const isValidTime = (t) => typeof t === 'string' && TIME.test(t);

/** Minutos -> "8h24" (ou "8h"). */
export function formatMinutes(total) {
  const sign = total < 0 ? '-' : '';
  const abs = Math.abs(Math.round(total));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}h${m ? String(m).padStart(2, '0') : ''}`;
}

/** Horas decimais -> "42h" / "41,5h". */
export function formatHours(hours) {
  return `${String(Math.round(hours * 100) / 100).replace('.', ',')}h`;
}

/**
 * Duração de relógio do turno, da entrada à saída (vira a meia-noite quando o fim é menor).
 * @param {string} startTime
 * @param {string} endTime
 * @returns {number | null} null se algum horário for inválido ou se início e fim forem iguais
 */
export function getClockMinutes(startTime, endTime) {
  if (!isValidTime(startTime) || !isValidTime(endTime) || startTime === endTime) return null;
  const { start, end } = getShiftWindow({ startTime, endTime });
  return end - start;
}

/** true se houver minutos entre 22h e 05h. */
export function computeIsNight(startTime, endTime) {
  if (!isValidTime(startTime) || !isValidTime(endTime)) return false;
  return getShiftNightMinutes({ startTime, endTime }) > 0;
}

/**
 * Indicadores ao vivo de um turno (ou rascunho de turno).
 * @returns {null | { workMinutes:number, legalMinutes:number, nightMinutes:number, weeklyHours:number,
 *   target:number, overTarget:boolean, requiredBreak:number, breakTooShort:boolean, overTenHours:boolean }}
 */
export function analyzeShift(shift, department) {
  if (!isValidTime(shift.startTime) || !isValidTime(shift.endTime) || shift.startTime === shift.endTime) return null;
  const s = { ...shift, breakDurationMinutes: Number(shift.breakDurationMinutes) || 0 };
  const workMinutes = getShiftWorkMinutes(s);
  const legalMinutes = getShiftLegalMinutes(s);
  const nightMinutes = getShiftNightMinutes(s);
  const weeklyHours = (legalMinutes * 5) / 60;
  const target = Number(department?.weeklyHoursTarget) || 42;
  const minBreak = Math.min(60, Math.max(30, Number(department?.minBreakMinutes) || 60));
  const requiredBreak = getRequiredBreakMinutes(workMinutes, minBreak);
  return {
    workMinutes,
    legalMinutes,
    nightMinutes,
    weeklyHours,
    target,
    overTarget: weeklyHours > target + 1e-9,
    requiredBreak,
    breakTooShort: s.breakDurationMinutes < requiredBreak,
    overTenHours: legalMinutes > 600,
  };
}
