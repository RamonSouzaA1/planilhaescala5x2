import { z } from 'zod';
import { isMonday, parseDate, formatDate } from '@escala/shared/utils/dateUtils.js';
import { getLegalWeeklyCapHours, getShiftWindow, MAX_BREAK_MINUTES } from '@escala/shared/utils/cltValidator.js';

/** Datas 'YYYY-MM-DD' reais (rejeita 2026-02-31). */
export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD.')
  .refine((v) => {
    // O refine roda mesmo quando o regex falhou; texto fora do padrão não pode estourar em parseDate.
    try {
      return formatDate(parseDate(v)) === v;
    } catch {
      return false;
    }
  }, 'Data inexistente.');

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

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8, 'A senha deve ter ao menos 8 caracteres.').max(128),
});

/** Exclusão da organização (LGPD): exige reenviar a senha do OWNER. */
export const deleteOrganizationSchema = z.object({ password: z.string().min(1).max(128) });

export const MAX_AUDIT_PAGE_SIZE = 100;
export const DEFAULT_AUDIT_PAGE_SIZE = 50;

export const auditLogQuerySchema = z
  .object({
    departmentId: z.string().min(1).optional(),
    from: dateString.optional(),
    to: dateString.optional(),
    limit: z.coerce.number().int().min(1).max(MAX_AUDIT_PAGE_SIZE).default(DEFAULT_AUDIT_PAGE_SIZE),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .refine((q) => !q.from || !q.to || q.to >= q.from, { message: 'A data final deve ser igual ou posterior à inicial.', path: ['to'] });

export const schedulePublishSchema = z.object({
  departmentId: z.string().min(1),
  weekStartDate: mondayString,
});

export const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
});

/** Meta semanal padrão de um setor novo, limitada ao teto legal da data. */
export const DEFAULT_WEEKLY_HOURS_TARGET = 42;

/**
 * Schema do setor com a meta semanal inteira de 1 até o teto legal vigente em `today`
 * (EC 141/2026: 44h → 42h em 15/12/2026 → 40h em 15/12/2027). Mesma regra do front-end.
 * @param {string} today - 'YYYY-MM-DD' (data de hoje no fuso de Brasília)
 */
export function createDepartmentSchema(today) {
  const cap = getLegalWeeklyCapHours(today);
  return z.object({
    name,
    defaultSundayRule: z.enum(['1_IN_3', '1_IN_2', 'CUSTOM']).default('1_IN_3'),
    weeklyHoursTarget: z
      .number()
      .int('A meta semanal deve ser um número inteiro de horas.')
      .min(1)
      .max(cap, `A meta semanal pode ter no máximo ${cap}h (teto legal vigente, EC 141/2026).`)
      .default(Math.min(DEFAULT_WEEKLY_HOURS_TARGET, cap)),
    minBreakMinutes: z.number().int().min(30).max(60).default(60),
    sundayCycleOffset: z.number().int().min(0).max(2).default(0),
  });
}

/** Ids de turno nas restrições: tamanho limitado; a rota confere que são turnos da organização. */
const shiftIdRef = z.string().trim().min(1).max(64);

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
      unavailableShiftIds: z.array(shiftIdRef).max(50).optional(),
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
export const ABSENCE_DATES_MESSAGE = 'A data final deve ser igual ou posterior à inicial.';
export const absenceSchema = absenceBase.refine(endAfterStart, { message: ABSENCE_DATES_MESSAGE, path: ['endDate'] });
/**
 * PATCH: cada campo é validado aqui; a ordem das datas é conferida pela rota depois de
 * mesclar o patch com o registro gravado (`absenceDatesError`).
 */
export const absenceUpdateSchema = absenceBase.partial();

/**
 * Mensagem de erro quando a ausência (já mesclada com o registro) termina antes de começar.
 * @param {{ startDate?: string, endDate?: string }} absence
 * @returns {string | null}
 */
export function absenceDatesError(absence) {
  return endAfterStart(absence) ? null : ABSENCE_DATES_MESSAGE;
}

/** Papéis que o OWNER pode cadastrar (OWNER só nasce no registro da organização). */
export const ASSIGNABLE_ROLES = ['STORE_MANAGER', 'SECTION_LEADER', 'HR_AUDITOR'];

export const userCreateSchema = z
  .object({
    name,
    email: z.email().max(254),
    password: z.string().min(8, 'A senha deve ter ao menos 8 caracteres.').max(128),
    role: z.enum(ASSIGNABLE_ROLES),
    departmentIds: z.array(z.string().trim().min(1).max(64)).max(50).default([]),
  })
  .refine((u) => u.role !== 'SECTION_LEADER' || u.departmentIds.length > 0, {
    message: 'Líder de setor precisa de ao menos um setor.',
    path: ['departmentIds'],
  });

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
