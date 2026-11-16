/**
 * Store Zustand do front-end: "documento" (setores, equipe, turnos, cobertura, ausências e grade),
 * desfazer/refazer e persistência offline em localStorage. O histórico não é persistido.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { addDays, getDayOfWeek } from '@escala/shared/utils/dateUtils.js';
import { DAYS_OF_WEEK } from '@escala/shared/models/schemas.js';
import { generateSchedule } from '@escala/shared/utils/scheduleGenerator.js';
import { assignSundayGroups } from '@escala/shared/utils/sundayRotation.js';
import { createSampleDocument } from './sampleStore.js';

export const STORAGE_KEY = 'planilha-escala-5x2:v1';
export const STORAGE_VERSION = 1;
export const HISTORY_LIMIT = 50;
/** Estados do guia de primeiro uso: ainda não visto, concluído ou pulado. */
export const ONBOARDING_STATUSES = ['pending', 'done', 'skipped'];

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
    onboarding: 'pending',
    past: [],
    future: [],
    canUndo: false,
    canRedo: false,
  };
}

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
          const prevStart = addDays(weekStart, -7);
          const mine = state.assignments.filter((a) => a.departmentId === department.id);
          const employees = state.employees.filter((e) => e.departmentId === department.id);
          const { assignments: generated, validation } = generateSchedule({
            weekStartDate: weekStart,
            employees,
            shifts: state.shifts.filter((x) => x.departmentId === department.id),
            coverageRules: state.coverageRules.filter((x) => x.departmentId === department.id),
            absences: state.absences.filter((a) => employees.some((e) => e.id === a.employeeId)),
            previousAssignments: mine.filter((a) => inWeek(a.date, prevStart)),
            earlierAssignments: mine.filter((a) => inWeek(a.date, addDays(weekStart, -14))),
            nextAssignments: mine.filter((a) => inWeek(a.date, addDays(weekStart, 7))),
            existingAssignments: mine.filter((a) => inWeek(a.date, weekStart) && a.isPinned),
            department,
            scheduleCycleId: `${department.id}_${weekStart}`,
          });
          commit((s) => {
            const pinned = new Set(
              s.assignments
                .filter((a) => a.departmentId === department.id && inWeek(a.date, weekStart) && a.isPinned)
                .map((a) => cellKey(a.employeeId, a.date)),
            );
            const kept = s.assignments.filter(
              (a) => !(a.departmentId === department.id && inWeek(a.date, weekStart)) || a.isPinned,
            );
            const fresh = generated
              .filter((g) => !pinned.has(cellKey(g.employeeId, g.date)))
              .map((g) => ({ ...g, departmentId: department.id }));
            return { assignments: [...kept, ...fresh] };
          });
          return validation;
        },
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
        goToWeek: (weekStart) =>
          set((s) => (/^\d{4}-\d{2}-\d{2}$/.test(weekStart) ? { currentWeekStart: getMonday(weekStart) } : s)),
        nextWeek: () => set((s) => ({ currentWeekStart: addDays(s.currentWeekStart, 7) })),
        prevWeek: () => set((s) => ({ currentWeekStart: addDays(s.currentWeekStart, -7) })),

        // ------------------------------------------------------------ guia de primeiro uso (fora do histórico)
        /** @param {'pending' | 'done' | 'skipped'} status */
        setOnboarding: (status) => set((s) => (ONBOARDING_STATUSES.includes(status) ? { onboarding: status } : s)),

        // ------------------------------------------------------------ dados
        /** Substitui o documento pela Loja Exemplo (pode ser desfeito). */
        loadSampleStore: () => commit(() => createSampleDocument()),
        /** Volta ao estado inicial vazio e limpa o histórico. */
        resetAll: () => set(createInitialState()),
      };
    },
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      // Persiste só o documento e a semana atual; past/future ficam de fora.
      partialize: (state) => ({ ...pickDocument(state), currentWeekStart: state.currentWeekStart, onboarding: state.onboarding }),
      // Garante que currentWeekStart vindo do localStorage seja sempre uma segunda-feira válida.
      merge: (persisted, current) => {
        const saved = persisted && typeof persisted === 'object' ? persisted : {};
        const week = /^\d{4}-\d{2}-\d{2}$/.test(saved.currentWeekStart ?? '') ? getMonday(saved.currentWeekStart) : current.currentWeekStart;
        const onboarding = ONBOARDING_STATUSES.includes(saved.onboarding) ? saved.onboarding : current.onboarding;
        return { ...current, ...saved, currentWeekStart: week, onboarding };
      },
    },
  ),
);
