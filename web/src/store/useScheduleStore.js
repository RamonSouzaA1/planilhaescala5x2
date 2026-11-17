/**
 * Store Zustand do front-end: "documento" (setores, equipe, turnos, cobertura, ausências e grade),
 * desfazer/refazer e persistência offline em localStorage. O histórico não é persistido.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { addDays, getDayOfWeek } from '@escala/shared/utils/dateUtils.js';
import { DAYS_OF_WEEK } from '@escala/shared/models/schemas.js';
import { generateSchedule } from '@escala/shared/utils/scheduleGenerator.js';
import {
  addMonths,
  generateMonth as generateMonthSchedule,
  getMonthKey,
  getMonthWeeks,
  isMonthKey,
} from '@escala/shared/utils/monthSchedule.js';
import { assignSundayGroups } from '@escala/shared/utils/sundayRotation.js';
import { createSampleDocument } from './sampleStore.js';
import { sanitizeDocument } from './sanitizeDocument.js';
import { CORRUPTED_BACKUP_KEY, buildExportJson, removeAppKeys } from '../features/privacy/localData.js';

export const STORAGE_KEY = 'planilha-escala-5x2:v1';
export const STORAGE_VERSION = 1;
export const HISTORY_LIMIT = 50;
/** Estados do guia de primeiro uso: ainda não visto, concluído ou pulado. */
export const ONBOARDING_STATUSES = ['pending', 'done', 'skipped'];
/** Visualizações da grade: semana (padrão) ou mês. */
export const VIEW_MODES = ['week', 'month'];
const DEFAULT_VIEW_MODE = 'week';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Campos do "documento": é o que entra nos snapshots de desfazer e no localStorage. */
export const DOCUMENT_KEYS = [
  'organization',
  'departments',
  'activeDepartmentId',
  'employees',
  'shifts',
  'coverageRules',
  'absences',
  'assignments',
];

const newId = () => crypto.randomUUID();

/**
 * Segunda-feira ('YYYY-MM-DD') da semana que contém a data.
 * @param {string} date
 * @returns {string}
 */
export function getMonday(date) {
  return addDays(date, -DAYS_OF_WEEK.indexOf(getDayOfWeek(date)));
}

/** Hoje (data local) como 'YYYY-MM-DD'. */
function todayLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** @returns {string} segunda-feira da semana atual */
export function getCurrentMonday() {
  return getMonday(todayLocal());
}

/** @returns {object} documento vazio (sem setores) */
function createEmptyDocument() {
  return {
    organization: { id: newId(), name: 'Minha Organização', plan: 'FREE' },
    departments: [],
    activeDepartmentId: null,
    employees: [],
    shifts: [],
    coverageRules: [],
    absences: [],
    assignments: [],
  };
}

const pickDocument = (state) => Object.fromEntries(DOCUMENT_KEYS.map((k) => [k, state[k]]));
const historyFlags = (past, future) => ({ canUndo: past.length > 0, canRedo: future.length > 0 });

/**
 * Recalcula `sundayGroup` dos funcionários ACTIVE de cada setor (3 grupos para 1_IN_3, 2 para 1_IN_2).
 * @param {any[]} employees
 * @param {any[]} departments
 * @returns {any[]}
 */
function recomputeSundayGroups(employees, departments) {
  const newGroups = {};
  for (const department of departments) {
    const active = employees.filter((e) => e.departmentId === department.id && e.status === 'ACTIVE');
    Object.assign(newGroups, assignSundayGroups(active, department.defaultSundayRule === '1_IN_2' ? 2 : 3));
  }
  return employees.map((e) => (newGroups[e.id] && newGroups[e.id] !== e.sundayGroup ? { ...e, sundayGroup: newGroups[e.id] } : e));
}

const inWeek = (date, weekStart) => date >= weekStart && date <= addDays(weekStart, 6);
const cellKey = (employeeId, date) => `${employeeId}|${date}`;

/**
 * Primeira e última data das semanas inteiras que tocam o mês.
 * @param {string} monthKey
 * @returns {{ weeks: string[], from: string, to: string }}
 */
function monthRange(monthKey) {
  const weeks = getMonthWeeks(monthKey);
  return { weeks, from: weeks[0], to: addDays(weeks[weeks.length - 1], 6) };
}

/**
 * Navegação para a semana da data. O mês exibido é mantido enquanto a semana ainda toca nele;
 * senão passa a ser o mês da data (assim a semana sempre toca o mês atual).
 * @param {{ currentMonth: string }} state
 * @param {string} date - 'YYYY-MM-DD'
 * @returns {{ currentWeekStart: string, currentMonth: string }}
 */
function weekNavigation(state, date) {
  const week = getMonday(date);
  const keepMonth = isMonthKey(state.currentMonth) && getMonthWeeks(state.currentMonth).includes(week);
  return { currentWeekStart: week, currentMonth: keepMonth ? state.currentMonth : getMonthKey(date) };
}

/**
 * Insumos do gerador para o setor: equipe, turnos, cobertura, ausências e células do setor.
 * @param {any} state
 * @param {{ id: string }} department
 */
function departmentInputs(state, department) {
  const employees = state.employees.filter((e) => e.departmentId === department.id);
  const employeeIds = new Set(employees.map((e) => e.id));
  return {
    employees,
    shifts: state.shifts.filter((x) => x.departmentId === department.id),
    coverageRules: state.coverageRules.filter((x) => x.departmentId === department.id),
    absences: state.absences.filter((a) => employeeIds.has(a.employeeId)),
    mine: state.assignments.filter((a) => a.departmentId === department.id),
  };
}

/**
 * Substitui as células não travadas do setor entre `from` e `to` pelas geradas (as travadas ficam).
 * @param {any[]} assignments - células atuais (todas os setores)
 * @param {string} departmentId
 * @param {string} from
 * @param {string} to
 * @param {any[]} generated - células geradas (sem departmentId)
 * @returns {any[]}
 */
function replaceUnpinned(assignments, departmentId, from, to, generated) {
  const inRange = (a) => a.departmentId === departmentId && a.date >= from && a.date <= to;
  const pinned = new Set(assignments.filter((a) => inRange(a) && a.isPinned).map((a) => cellKey(a.employeeId, a.date)));
  const kept = assignments.filter((a) => !inRange(a) || a.isPinned);
  const fresh = generated
    .filter((g) => !pinned.has(cellKey(g.employeeId, g.date)))
    .map((g) => ({ ...g, departmentId, scheduleCycleId: g.scheduleCycleId ?? `${departmentId}_${getMonday(g.date)}` }));
  return [...kept, ...fresh];
}

/** @returns {object} DailyAssignment com departmentId */
function makeCell({ departmentId, employeeId, date, type, shiftId, isPinned = false }) {
  return {
    id: `${employeeId}_${date}`,
    scheduleCycleId: `${departmentId}_${getMonday(date)}`,
    departmentId,
    employeeId,
    date,
    dayOfWeek: getDayOfWeek(date),
    type,
    shiftId: type === 'WORK' ? shiftId : undefined,
    isPinned,
  };
}

/**
 * @typedef {import('@escala/shared/models/schemas.js').Employee} Employee
 * @typedef {import('@escala/shared/models/schemas.js').Department} Department
 * @typedef {import('@escala/shared/models/schemas.js').ShiftTemplate} ShiftTemplate
 * @typedef {import('@escala/shared/models/schemas.js').CoverageRule} CoverageRule
 * @typedef {import('@escala/shared/models/schemas.js').Absence} Absence
 */

/** Estado inicial completo (documento + navegação + histórico). */
function createInitialState() {
  return {
    ...createEmptyDocument(),
    currentWeekStart: getCurrentMonday(),
    currentMonth: getMonthKey(todayLocal()),
    viewMode: DEFAULT_VIEW_MODE,
    onboarding: 'pending',
    past: [],
    future: [],
    canUndo: false,
    canRedo: false,
  };
}

/** Guarda o conteúdo ilegível/inválido numa chave à parte, para o usuário ainda poder exportá-lo. */
function backupCorrupted(raw) {
  try {
    localStorage.setItem(CORRUPTED_BACKUP_KEY, typeof raw === 'string' ? raw : JSON.stringify(raw));
  } catch (error) {
    console.error('Não foi possível guardar a cópia dos dados corrompidos', error);
  }
}

/** Storage do persist que nunca lança: JSON corrompido vira "sem dados" (com cópia de segurança). */
const safeStorage = {
  getItem: (name) => {
    let raw = null;
    try {
      raw = localStorage.getItem(name);
    } catch {
      return null;
    }
    if (raw === null) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // cai no tratamento abaixo
    }
    console.error('Dados salvos ilegíveis; abrindo em estado seguro.');
    backupCorrupted(raw);
    return null;
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, JSON.stringify(value));
    } catch (error) {
      console.error('Não foi possível salvar neste navegador', error);
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch (error) {
      console.error('Não foi possível remover dados deste navegador', error);
    }
  },
};

export const useScheduleStore = create()(
  persist(
    (set, get) => {
      /**
       * Aplica uma alteração do documento empilhando o snapshot anterior (limite de 50) e
       * limpando o `future`. `producer(state)` devolve o patch, ou null/undefined para não fazer nada.
       */
      const commit = (producer) =>
        set((state) => {
          const patch = producer(state);
          if (!patch) return state;
          const past = [...state.past, pickDocument(state)].slice(-HISTORY_LIMIT);
          return { ...patch, past, future: [], ...historyFlags(past, []) };
        });

      /** Setor ativo ou null. */
      const activeDepartment = (state) => state.departments.find((d) => d.id === state.activeDepartmentId) ?? null;

      return {
        ...createInitialState(),

        // ------------------------------------------------------------ desfazer / refazer
        /** Desfaz a última alteração do documento. */
        undo: () =>
          set((state) => {
            if (!state.past.length) return state;
            const past = state.past.slice(0, -1);
            const future = [...state.future, pickDocument(state)].slice(-HISTORY_LIMIT);
            return { ...state.past[state.past.length - 1], past, future, ...historyFlags(past, future) };
          }),
        /** Refaz a última alteração desfeita. */
        redo: () =>
          set((state) => {
            if (!state.future.length) return state;
            const future = state.future.slice(0, -1);
            const past = [...state.past, pickDocument(state)].slice(-HISTORY_LIMIT);
            return { ...state.future[state.future.length - 1], past, future, ...historyFlags(past, future) };
          }),

        // ------------------------------------------------------------ setores
        /**
         * @param {Partial<Department> & { name: string }} data
         * @returns {string} id do setor criado
         */
        addDepartment: (data) => {
          const department = {
            defaultSundayRule: '1_IN_3',
            weeklyHoursTarget: 42,
            ...data,
            id: newId(),
            storeId: get().organization.id,
          };
          commit((s) => ({
            departments: [...s.departments, department],
            activeDepartmentId: s.activeDepartmentId ?? department.id,
          }));
          return department.id;
        },
        /** @param {string} id @param {Partial<Department>} patch */
        updateDepartment: (id, patch) =>
          commit((s) => {
            if (!s.departments.some((d) => d.id === id)) return null;
            const departments = s.departments.map((d) => (d.id === id ? { ...d, ...patch, id } : d));
            return { departments, employees: recomputeSundayGroups(s.employees, departments) };
          }),
        /** Remove o setor e tudo que pertence a ele (equipe, turnos, cobertura, ausências, grade). */
        removeDepartment: (id) =>
          commit((s) => {
            if (!s.departments.some((d) => d.id === id)) return null;
            const gone = new Set(s.employees.filter((e) => e.departmentId === id).map((e) => e.id));
            const departments = s.departments.filter((d) => d.id !== id);
            return {
              departments,
              activeDepartmentId: s.activeDepartmentId === id ? (departments[0]?.id ?? null) : s.activeDepartmentId,
              employees: s.employees.filter((e) => e.departmentId !== id),
              shifts: s.shifts.filter((x) => x.departmentId !== id),
              coverageRules: s.coverageRules.filter((x) => x.departmentId !== id),
              absences: s.absences.filter((a) => !gone.has(a.employeeId)),
              assignments: s.assignments.filter((a) => a.departmentId !== id),
            };
          }),
        /** Troca de setor: não entra no histórico. @param {string} id */
        setActiveDepartment: (id) => set((s) => (s.departments.some((d) => d.id === id) ? { activeDepartmentId: id } : s)),

        // ------------------------------------------------------------ funcionários
        /**
         * Sem limite de quantidade: o paywall do plano FREE é só na exportação (spec 6.3).
         * @param {Partial<Employee> & { name: string }} data - departmentId padrão: setor ativo
         * @returns {Employee | null} funcionário criado (null se não houver setor)
         */
        addEmployee: (data) => get().addEmployeesBulk([data])[0] ?? null,
        /**
         * Inclui vários funcionários em uma única ação (um passo de desfazer).
         * @param {Array<Partial<Employee> & { name: string }>} list
         * @returns {Employee[]}
         */
        addEmployeesBulk: (list) => {
          const created = [];
          commit((s) => {
            const now = new Date().toISOString();
            for (const data of list) {
              const departmentId = data.departmentId ?? s.activeDepartmentId;
              const name = typeof data.name === 'string' ? data.name.trim() : '';
              if (!departmentId || !name) continue;
              created.push({
                roleTitle: '',
                tags: [],
                ...data,
                name,
                id: newId(),
                departmentId,
                accessToken: newId(),
                sundayGroup: 1,
                status: data.status ?? 'ACTIVE',
                createdAt: now,
              });
            }
            if (!created.length) return null;
            return { employees: recomputeSundayGroups([...s.employees, ...created], s.departments) };
          });
          // Devolve os objetos já com o grupo de domingo recalculado.
          const byId = new Map(get().employees.map((e) => [e.id, e]));
          return created.map((e) => byId.get(e.id) ?? e);
        },
        /** @param {string} id @param {Partial<Employee>} patch */
        updateEmployee: (id, patch) =>
          commit((s) => {
            if (!s.employees.some((e) => e.id === id)) return null;
            const employees = s.employees.map((e) => (e.id === id ? { ...e, ...patch, id } : e));
            const regroup = 'status' in patch || 'departmentId' in patch;
            return { employees: regroup ? recomputeSundayGroups(employees, s.departments) : employees };
          }),
        /** @param {string} id @param {import('@escala/shared/models/schemas.js').EmployeeStatus} status */
        setEmployeeStatus: (id, status) => get().updateEmployee(id, { status }),
        /** Remove o funcionário, suas ausências e células. */
        removeEmployee: (id) =>
          commit((s) => {
            if (!s.employees.some((e) => e.id === id)) return null;
            return {
              employees: recomputeSundayGroups(
                s.employees.filter((e) => e.id !== id),
                s.departments,
              ),
              absences: s.absences.filter((a) => a.employeeId !== id),
              assignments: s.assignments.filter((a) => a.employeeId !== id),
            };
          }),

        // ------------------------------------------------------------ turnos
        /**
         * @param {Partial<ShiftTemplate> & { name: string, startTime: string, endTime: string }} data
         * @returns {ShiftTemplate | null}
         */
        addShift: (data) => {
          const departmentId = data.departmentId ?? get().activeDepartmentId;
          if (!departmentId) return null;
          const shift = {
            code: '',
            breakDurationMinutes: 60,
            color: '#2563EB',
            isNightShift: false,
            ...data,
            id: newId(),
            departmentId,
          };
          commit((s) => ({ shifts: [...s.shifts, shift] }));
          return shift;
        },
        /** @param {string} id @param {Partial<ShiftTemplate>} patch */
        updateShift: (id, patch) =>
          commit((s) =>
            s.shifts.some((x) => x.id === id) ? { shifts: s.shifts.map((x) => (x.id === id ? { ...x, ...patch, id } : x)) } : null,
          ),
        /** Remove o turno e as células de trabalho que o usavam. */
        removeShift: (id) =>
          commit((s) => {
            if (!s.shifts.some((x) => x.id === id)) return null;
            return {
              shifts: s.shifts.filter((x) => x.id !== id),
              assignments: s.assignments.filter((a) => a.shiftId !== id),
              employees: s.employees.map((e) =>
                e.fixedConstraints?.unavailableShiftIds?.includes(id)
                  ? {
                      ...e,
                      fixedConstraints: {
                        ...e.fixedConstraints,
                        unavailableShiftIds: e.fixedConstraints.unavailableShiftIds.filter((x) => x !== id),
                      },
                    }
                  : e,
              ),
            };
          }),

        // ------------------------------------------------------------ cobertura
        /**
         * Cria ou substitui a regra do (setor, dia da semana).
         * @param {Partial<CoverageRule> & { dayOfWeek: string, minTotalStaff: number }} rule
         */
        upsertCoverageRule: (rule) =>
          commit((s) => {
            const departmentId = rule.departmentId ?? s.activeDepartmentId;
            if (!departmentId) return null;
            const existing = s.coverageRules.find((r) => r.departmentId === departmentId && r.dayOfWeek === rule.dayOfWeek);
            const next = { requiredTags: [], peakHours: [], ...rule, id: existing?.id ?? newId(), departmentId };
            return {
              coverageRules: existing
                ? s.coverageRules.map((r) => (r.id === existing.id ? next : r))
                : [...s.coverageRules, next],
            };
          }),
        /** @param {string} id */
        removeCoverageRule: (id) =>
          commit((s) => (s.coverageRules.some((r) => r.id === id) ? { coverageRules: s.coverageRules.filter((r) => r.id !== id) } : null)),

        // ------------------------------------------------------------ ausências
        /**
         * @param {Omit<Absence, 'id'>} data
         * @returns {Absence}
         */
        addAbsence: (data) => {
          const absence = { ...data, id: newId() };
          commit((s) => ({ absences: [...s.absences, absence] }));
          return absence;
        },
        /** @param {string} id */
        removeAbsence: (id) =>
          commit((s) => (s.absences.some((a) => a.id === id) ? { absences: s.absences.filter((a) => a.id !== id) } : null)),

        // ------------------------------------------------------------ grade
        /**
         * Edição manual de uma célula. Mantém a trava existente.
         * @param {string} employeeId
         * @param {string} date - 'YYYY-MM-DD'
         * @param {{ type: 'WORK' | 'OFF' | 'ABSENCE', shiftId?: string }} value - WORK exige shiftId
         */
        setCell: (employeeId, date, { type, shiftId }) =>
          commit((s) => {
            const employee = s.employees.find((e) => e.id === employeeId);
            if (!employee || (type === 'WORK' && !shiftId)) return null;
            const old = s.assignments.find((a) => a.employeeId === employeeId && a.date === date);
            const cell = makeCell({ departmentId: employee.departmentId, employeeId, date, type, shiftId, isPinned: old?.isPinned ?? false });
            return { assignments: [...s.assignments.filter((a) => a !== old), cell] };
          }),
        /** Alterna a trava (isPinned) da célula; não faz nada se a célula não existe. */
        togglePin: (employeeId, date) =>
          commit((s) => {
            const old = s.assignments.find((a) => a.employeeId === employeeId && a.date === date);
            if (!old) return null;
            return { assignments: s.assignments.map((a) => (a === old ? { ...a, isPinned: !a.isPinned } : a)) };
          }),
        /**
         * Gera a escala da semana atual do setor ativo, preservando as células travadas.
         * @returns {import('@escala/shared/utils/cltValidator.js').ValidationResult | null} null sem setor ativo
         */
        generateWeek: () => {
          const state = get();
          const department = activeDepartment(state);
          if (!department) return null;
          const weekStart = state.currentWeekStart;
          const { mine, ...inputs } = departmentInputs(state, department);
          const { assignments: generated, validation } = generateSchedule({
            ...inputs,
            weekStartDate: weekStart,
            previousAssignments: mine.filter((a) => inWeek(a.date, addDays(weekStart, -7))),
            earlierAssignments: mine.filter((a) => inWeek(a.date, addDays(weekStart, -14))),
            nextAssignments: mine.filter((a) => inWeek(a.date, addDays(weekStart, 7))),
            existingAssignments: mine.filter((a) => inWeek(a.date, weekStart) && a.isPinned),
            department,
            scheduleCycleId: `${department.id}_${weekStart}`,
          });
          commit((s) => ({
            assignments: replaceUnpinned(s.assignments, department.id, weekStart, addDays(weekStart, 6), generated),
          }));
          return validation;
        },
        /**
         * Gera as semanas inteiras do mês atual (currentMonth) no setor ativo, em ordem, encadeando
         * cada semana na seguinte. Substitui as células não travadas dessas semanas; as travadas,
         * as ausências e a semana anterior/seguinte ao mês já gravadas são respeitadas.
         * Um único passo de desfazer.
         * @returns {import('@escala/shared/utils/monthSchedule.js').MonthValidation | null} null sem setor ativo
         */
        generateMonth: () => {
          const state = get();
          const department = activeDepartment(state);
          if (!department) return null;
          const { weeks, from, to } = monthRange(state.currentMonth);
          const { mine, ...inputs } = departmentInputs(state, department);
          const { assignments: generated, ...result } = generateMonthSchedule({
            ...inputs,
            monthKey: state.currentMonth,
            previousAssignments: mine.filter((a) => inWeek(a.date, addDays(from, -7))),
            earlierAssignments: mine.filter((a) => inWeek(a.date, addDays(from, -14))),
            nextAssignments: mine.filter((a) => inWeek(a.date, addDays(weeks[weeks.length - 1], 7))),
            existingAssignments: mine.filter((a) => a.date >= from && a.date <= to && a.isPinned),
            department,
          });
          commit((s) => ({ assignments: replaceUnpinned(s.assignments, department.id, from, to, generated) }));
          return result;
        },
        /** Apaga as células do setor ativo nas semanas do mês atual (inclusive travadas). */
        clearMonth: () =>
          commit((s) => {
            const { from, to } = monthRange(s.currentMonth);
            const kept = s.assignments.filter(
              (a) => !(a.departmentId === s.activeDepartmentId && a.date >= from && a.date <= to),
            );
            return kept.length === s.assignments.length ? null : { assignments: kept };
          }),
        /** Copia trabalho/folga/turno da semana anterior para a atual (sem travas), substituindo a semana. */
        duplicatePreviousWeek: () =>
          commit((s) => {
            const department = activeDepartment(s);
            if (!department) return null;
            const weekStart = s.currentWeekStart;
            const prevStart = addDays(weekStart, -7);
            const employeeIds = new Set(s.employees.filter((e) => e.departmentId === department.id).map((e) => e.id));
            const absent = (employeeId, date) =>
              s.absences.some((a) => a.employeeId === employeeId && date >= a.startDate && date <= a.endDate);
            const copies = s.assignments
              .filter((a) => a.departmentId === department.id && inWeek(a.date, prevStart) && employeeIds.has(a.employeeId))
              .map((a) => {
                const date = addDays(a.date, 7);
                const type = a.type === 'ABSENCE' && !absent(a.employeeId, date) ? 'OFF' : a.type;
                return makeCell({ departmentId: department.id, employeeId: a.employeeId, date, type, shiftId: a.shiftId });
              });
            const kept = s.assignments.filter((a) => !(a.departmentId === department.id && inWeek(a.date, weekStart)));
            return { assignments: [...kept, ...copies] };
          }),
        /** Apaga todas as células do setor ativo na semana atual (inclusive travadas). */
        clearWeek: () =>
          commit((s) => {
            const weekStart = s.currentWeekStart;
            const kept = s.assignments.filter((a) => !(a.departmentId === s.activeDepartmentId && inWeek(a.date, weekStart)));
            return kept.length === s.assignments.length ? null : { assignments: kept };
          }),

        // ------------------------------------------------------------ navegação (fora do histórico)
        /** @param {string} weekStart - qualquer data; é ajustada para a segunda-feira da semana */
        goToWeek: (weekStart) => set((s) => (DATE_PATTERN.test(weekStart) ? weekNavigation(s, weekStart) : s)),
        nextWeek: () => set((s) => weekNavigation(s, addDays(s.currentWeekStart, 7))),
        prevWeek: () => set((s) => weekNavigation(s, addDays(s.currentWeekStart, -7))),
        /**
         * Vai para o mês; a semana atual passa a ser a primeira semana que toca o mês.
         * @param {string} monthKey - 'YYYY-MM' (inválido é ignorado)
         */
        goToMonth: (monthKey) =>
          set((s) => (isMonthKey(monthKey) ? { currentMonth: monthKey, currentWeekStart: getMonthWeeks(monthKey)[0] } : s)),
        nextMonth: () => get().goToMonth(addMonths(get().currentMonth, 1)),
        prevMonth: () => get().goToMonth(addMonths(get().currentMonth, -1)),
        /** @param {'week' | 'month'} mode - outros valores são ignorados */
        setViewMode: (mode) => set((s) => (VIEW_MODES.includes(mode) ? { viewMode: mode } : s)),

        // ------------------------------------------------------------ guia de primeiro uso (fora do histórico)
        /** @param {'pending' | 'done' | 'skipped'} status */
        setOnboarding: (status) => set((s) => (ONBOARDING_STATUSES.includes(status) ? { onboarding: status } : s)),

        // ------------------------------------------------------------ dados
        /** Substitui o documento pela Loja Exemplo (pode ser desfeito). */
        loadSampleStore: () => commit(() => createSampleDocument()),
        /** Volta ao estado inicial vazio e limpa o histórico. */
        resetAll: () => set(createInitialState()),

        // ------------------------------------------------------------ privacidade (LGPD)
        /** @returns {string} JSON com tudo que o app guarda neste navegador (para download) */
        exportLocalData: () => {
          const state = get();
          return buildExportJson({ currentState: { ...pickDocument(state), onboarding: state.onboarding } });
        },
        /** Apaga todos os dados do app no navegador e volta ao estado inicial (onboarding 'pending'). */
        wipeLocalData: () => {
          // Primeiro zera o store (o persist regrava a chave) e só depois limpa o localStorage.
          set(createInitialState());
          removeAppKeys();
        },
      };
    },
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: safeStorage,
      // Persiste o documento, a navegação (semana, mês, modo) e o guia; past/future ficam de fora.
      partialize: (state) => ({
        ...pickDocument(state),
        currentWeekStart: state.currentWeekStart,
        currentMonth: state.currentMonth,
        viewMode: state.viewMode,
        onboarding: state.onboarding,
      }),
      // Garante que currentWeekStart seja uma segunda-feira válida, que currentMonth seja um mês
      // tocado por essa semana (senão, o mês da semana) e que viewMode seja conhecido.
      merge: (persisted, current) => {
        const saved = persisted && typeof persisted === 'object' ? persisted : {};
        // Dado corrompido/inválido é descartado em vez de quebrar a tela.
        const { document, discarded } = sanitizeDocument(saved);
        if (discarded) backupCorrupted(saved);
        const week = DATE_PATTERN.test(saved.currentWeekStart ?? '') ? getMonday(saved.currentWeekStart) : current.currentWeekStart;
        const monthFits = isMonthKey(saved.currentMonth) && getMonthWeeks(saved.currentMonth).includes(week);
        const currentMonth = monthFits ? saved.currentMonth : getMonthKey(week);
        const viewMode = VIEW_MODES.includes(saved.viewMode) ? saved.viewMode : DEFAULT_VIEW_MODE;
        const onboarding = ONBOARDING_STATUSES.includes(saved.onboarding) ? saved.onboarding : current.onboarding;
        return { ...current, ...document, currentWeekStart: week, currentMonth, viewMode, onboarding };
      },
    },
  ),
);
