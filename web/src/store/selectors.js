/**
 * Seletores puros do store. Recebem o estado (`useScheduleStore.getState()` ou o argumento
 * de `useScheduleStore(selector)`). Os que devolvem arrays/objetos reaproveitam o último
 * resultado quando as entradas não mudaram, então são seguros para usar direto em hooks.
 */

import { addDays } from '@escala/shared/utils/dateUtils.js';
import { validateSchedule } from '@escala/shared/utils/cltValidator.js';

/** Memoriza só a última chamada, comparando os argumentos por identidade. */
function memoizeLast(fn) {
  let lastArgs = null;
  let lastResult;
  return (...args) => {
    if (lastArgs && args.length === lastArgs.length && args.every((a, i) => Object.is(a, lastArgs[i]))) {
      return lastResult;
    }
    lastArgs = args;
    lastResult = fn(...args);
    return lastResult;
  };
}

/**
 * @param {{ departments: any[], activeDepartmentId: string | null }} state
 * @returns {any | null} setor ativo
 */
export function selectActiveDepartment(state) {
  return state.departments.find((d) => d.id === state.activeDepartmentId) ?? null;
}

// Um cache por lista: se as três compartilhassem o mesmo memoizeLast, usar dois seletores no
// mesmo componente invalidaria o cache do outro a cada leitura (loop de renderização).
const byDepartment = () => memoizeLast((list, departmentId) => list.filter((x) => x.departmentId === departmentId));
const employeesOfDepartment = byDepartment();
const shiftsOfDepartment = byDepartment();
const coverageRulesOfDepartment = byDepartment();
const filterActive = memoizeLast((list) => list.filter((e) => e.status === 'ACTIVE'));

/**
 * Funcionários do setor ativo.
 * @param {any} state
 * @param {{ activeOnly?: boolean }} [options] - activeOnly: só status ACTIVE (padrão: todos)
 * @returns {any[]}
 */
export function selectDepartmentEmployees(state, { activeOnly = false } = {}) {
  const all = employeesOfDepartment(state.employees, state.activeDepartmentId);
  return activeOnly ? filterActive(all) : all;
}

/** @param {any} state @returns {any[]} funcionários ACTIVE do setor ativo */
export function selectActiveEmployees(state) {
  return selectDepartmentEmployees(state, { activeOnly: true });
}

/** @param {any} state @returns {any[]} turnos do setor ativo */
export function selectDepartmentShifts(state) {
  return shiftsOfDepartment(state.shifts, state.activeDepartmentId);
}

/** @param {any} state @returns {any[]} regras de cobertura do setor ativo */
export function selectDepartmentCoverageRules(state) {
  return coverageRulesOfDepartment(state.coverageRules, state.activeDepartmentId);
}

const absencesOf = memoizeLast((absences, employees, departmentId) => {
  const ids = new Set(employees.filter((e) => e.departmentId === departmentId).map((e) => e.id));
  return absences.filter((a) => ids.has(a.employeeId));
});

/** @param {any} state @returns {any[]} ausências dos funcionários do setor ativo */
export function selectDepartmentAbsences(state) {
  return absencesOf(state.absences, state.employees, state.activeDepartmentId);
}

const weekCells = memoizeLast((assignments, departmentId, weekStart) => {
  const end = addDays(weekStart, 6);
  return assignments.filter((a) => a.departmentId === departmentId && a.date >= weekStart && a.date <= end);
});

/**
 * Células do setor ativo na semana.
 * @param {any} state
 * @param {string} [weekStart] - segunda-feira; padrão: semana atual do store
 * @returns {any[]}
 */
export function selectWeekAssignments(state, weekStart = state.currentWeekStart) {
  return weekCells(state.assignments, state.activeDepartmentId, weekStart);
}

const cellIndexes = new WeakMap();

/** Índice "employeeId|date" → célula, por array de assignments. */
function cellIndex(assignments) {
  let index = cellIndexes.get(assignments);
  if (!index) {
    index = new Map(assignments.map((a) => [`${a.employeeId}|${a.date}`, a]));
    cellIndexes.set(assignments, index);
  }
  return index;
}

/**
 * @param {any} state
 * @param {string} employeeId
 * @param {string} date - 'YYYY-MM-DD'
 * @returns {any | undefined} célula (DailyAssignment) ou undefined se vazia
 */
export function selectCell(state, employeeId, date) {
  return cellIndex(state.assignments).get(`${employeeId}|${date}`);
}

const validate = memoizeLast((department, employees, shifts, rules, absences, assignments, weekStart) => {
  if (!department) return null;
  const end = addDays(weekStart, 6);
  const prevStart = addDays(weekStart, -7);
  const nextEnd = addDays(weekStart, 13);
  const mine = assignments.filter((a) => a.departmentId === department.id);
  return validateSchedule({
    weekStartDate: weekStart,
    employees,
    shifts,
    coverageRules: rules,
    absences,
    assignments: mine.filter((a) => a.date >= weekStart && a.date <= end),
    previousAssignments: mine.filter((a) => a.date >= prevStart && a.date < weekStart),
    earlierAssignments: mine.filter((a) => a.date >= addDays(weekStart, -14) && a.date < prevStart),
    nextAssignments: mine.filter((a) => a.date > end && a.date <= nextEnd),
    department,
  });
});

/**
 * Validação CLT da semana atual do setor ativo (inclui a semana anterior).
 * @param {any} state
 * @returns {import('@escala/shared/utils/cltValidator.js').ValidationResult | null} null sem setor ativo
 */
export function selectWeekValidation(state) {
  return validate(
    selectActiveDepartment(state),
    selectDepartmentEmployees(state),
    selectDepartmentShifts(state),
    selectDepartmentCoverageRules(state),
    selectDepartmentAbsences(state),
    state.assignments,
    state.currentWeekStart,
  );
}
