import { z } from 'zod';
import { isMonday, parseDate, formatDate } from '@escala/shared/utils/dateUtils.js';
import { getShiftWindow, MAX_BREAK_MINUTES } from '@escala/shared/utils/cltValidator.js';

/** Datas 'YYYY-MM-DD' reais (rejeita 2026-02-31). */
export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD.')
  .refine((v) => formatDate(parseDate(v)) === v, 'Data inexistente.');

/** Segunda-feira no formato 'YYYY-MM-DD'. */
export const mondayString = dateString.refine(isMonday, 'A semana deve começar numa segunda-feira.');

export const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use o formato HH:MM.');

const DAYS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'];
const name = z.string().trim().min(1).max(100);

export const registerSchema = z.object({
  name,
  email: z.email().max(254),
  password: z.string().min(8, 'A senha deve ter ao menos 8 caracteres.').max(128),
  organizationName: name.optional(),
  referredByCode: z.string().trim().max(32).optional(),
});

export const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
});

export const departmentSchema = z.object({
  name,
  defaultSundayRule: z.enum(['1_IN_3', '1_IN_2', 'CUSTOM']).default('1_IN_3'),
  weeklyHoursTarget: z.number().int().min(1).max(44).default(42),
  minBreakMinutes: z.number().int().min(30).max(60).default(60),
  sundayCycleOffset: z.number().int().min(0).max(2).default(0),
});

export const employeeSchema = z.object({
  departmentId: z.string().min(1),
  name,
  phone: z.string().trim().max(30).optional(),
  roleTitle: z.string().trim().max(100).default(''),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  sundayGroup: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  customSundayRule: z.enum(['1_IN_2', '1_IN_3']).nullish(),
  fixedConstraints: z
    .object({
      unavailableDays: z.array(z.enum(DAYS)).max(7).optional(),
      unavailableShiftIds: z.array(z.string()).max(50).optional(),
    })
    .optional(),
  status: z.enum(['ACTIVE', 'VACATION', 'MEDICAL_LEAVE', 'INACTIVE']).default('ACTIVE'),
});
export const employeeUpdateSchema = employeeSchema.partial();

const shiftBase = z.object({
  departmentId: z.string().min(1),
  name,
  code: z.string().trim().min(1).max(10),
  startTime: timeString,
  endTime: timeString,
  breakDurationMinutes: z
    .number()
    .int()
    .min(0)
    .max(MAX_BREAK_MINUTES, `O intervalo pode ter no máximo ${MAX_BREAK_MINUTES} min (art. 71 CLT).`)
    .default(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use cor hexadecimal, ex.: #2563EB.').default('#2563EB'),
  isNightShift: z.boolean().default(false),
});

/**
 * Mensagem de erro quando o intervalo não cabe no turno (null se cabe ou se faltam dados).
 * A duração de relógio considera turnos que viram a meia-noite.
 * @param {{ startTime?: string, endTime?: string, breakDurationMinutes?: number }} shift
 * @returns {string | null}
 */
export function shiftBreakError({ startTime, endTime, breakDurationMinutes }) {
  if (typeof breakDurationMinutes !== 'number') return null;
  if (!timeString.safeParse(startTime).success || !timeString.safeParse(endTime).success) return null;
  const { start, end } = getShiftWindow({ startTime, endTime });
  const clockMinutes = end - start;
  if (breakDurationMinutes < clockMinutes) return null;
  return `O intervalo (${breakDurationMinutes} min) deve ser menor que a duração do turno (${clockMinutes} min).`;
}

/** @param {any} value @param {import('zod').RefinementCtx} ctx */
const breakFitsShift = (value, ctx) => {
  const message = shiftBreakError(value);
  if (message) ctx.addIssue({ code: 'custom', message, path: ['breakDurationMinutes'] });
};

export const shiftSchema = shiftBase.superRefine(breakFitsShift);
/**
 * PATCH: sem refinamento aqui, porque o default do intervalo apareceria mesmo sem ser enviado.
 * A rota mescla o patch com o turno gravado e chama `shiftBreakError`.
 */
export const shiftUpdateSchema = shiftBase.partial();

const absenceBase = z.object({
  employeeId: z.string().min(1),
  type: z.enum(['VACATION', 'MEDICAL', 'COMP_TIME', 'OTHER']),
  startDate: dateString,
  endDate: dateString,
  notes: z.string().trim().max(500).optional(),
});
const endAfterStart = (v) => !v.startDate || !v.endDate || v.endDate >= v.startDate;
export const absenceSchema = absenceBase.refine(endAfterStart, { message: 'A data final deve ser igual ou posterior à inicial.', path: ['endDate'] });
export const absenceUpdateSchema = absenceBase.partial().refine(endAfterStart, { message: 'A data final deve ser igual ou posterior à inicial.', path: ['endDate'] });

export const scheduleQuerySchema = z.object({
  departmentId: z.string().min(1),
  weekStart: mondayString,
});

export const scheduleSaveSchema = z.object({
  departmentId: z.string().min(1),
  weekStartDate: mondayString,
  assignments: z
    .array(
      z.object({
        employeeId: z.string().min(1),
        date: dateString,
        type: z.enum(['WORK', 'OFF', 'ABSENCE']),
        shiftId: z.string().min(1).optional(),
        isPinned: z.boolean().default(false),
      }),
    )
    .max(7 * 500),
});

export const scheduleGenerateSchema = z.object({
  departmentId: z.string().min(1),
  weekStartDate: mondayString,
  peakDates: z.array(dateString).max(31).default([]),
});

export const publicTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{20,64}$/);
