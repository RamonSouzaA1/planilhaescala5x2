/** Utilidades compartilhadas da grade (formatação, cores, filtros). */

import { addDays, getWeekDates } from '@escala/shared/utils/dateUtils.js';

export const DAY_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
export const DAY_LONG = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

/** @param {string} date 'YYYY-MM-DD' -> 'dd/mm' */
export const formatDM = (date) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/** @param {string} date 'YYYY-MM-DD' -> 'dd/mm/yyyy' */
export const formatDMY = (date) => `${formatDM(date)}/${date.slice(0, 4)}`;

/** Intervalo da semana: "16/11 – 22/11/2026" (com ano nos dois lados se cruzar o ano). */
export function formatWeekRange(weekStart) {
  const end = addDays(weekStart, 6);
  return weekStart.slice(0, 4) === end.slice(0, 4)
    ? `${formatDM(weekStart)} – ${formatDMY(end)}`
    : `${formatDMY(weekStart)} – ${formatDMY(end)}`;
}

export { getWeekDates };

/** @param {number} minutes -> '38h30' */
export function formatHours(minutes) {
  const abs = Math.round(minutes);
  return `${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, '0')}`;
}

/** Remove acentos e caixa, para buscas. */
export const normalizeText = (text) => String(text ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Rótulo curto do turno: código ou nome. */
export const shiftLabel = (shift) => shift.code || shift.name;

/** Estilo do turno: fundo suave, borda lateral e texto escurecido da própria cor (contraste AA). */
export function shiftStyle(color) {
  const c = /^#[0-9a-fA-F]{6}$/.test(color ?? '') ? color : '#2563EB';
  return {
    backgroundColor: `${c}24`,
    borderLeftColor: c,
    color: `color-mix(in srgb, ${c} 45%, #0f172a)`,
  };
}

export const OFF_FILTER = '__OFF__';

export const DEFAULT_FILTERS = Object.freeze({ query: '', shiftId: '', tag: '', onlyAlerts: false });

/** Texto de um semáforo: "1 alerta vermelho, 2 amarelos". */
export function describeIssues(red, yellow) {
  const parts = [];
  if (red) parts.push(`${red} alerta${red > 1 ? 's' : ''} vermelho${red > 1 ? 's' : ''}`);
  if (yellow) parts.push(`${yellow} alerta${yellow > 1 ? 's' : ''} amarelo${yellow > 1 ? 's' : ''}`);
  return parts.join(', ');
}
