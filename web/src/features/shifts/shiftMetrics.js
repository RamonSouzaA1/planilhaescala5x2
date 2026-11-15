import {
  getRequiredBreakMinutes,
  getShiftLegalMinutes,
  getShiftNightMinutes,
  getShiftWorkMinutes,
} from '@escala/shared/utils/cltValidator.js';

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
