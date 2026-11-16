import { useDeferredValue, useMemo } from 'react';
import { getMonthGridDates } from '@escala/shared/utils/monthSchedule.js';
import { useScheduleStore } from '../../store/useScheduleStore.js';
import {
  selectActiveDepartment,
  selectDepartmentEmployees,
  selectDepartmentShifts,
  selectMonthAssignments,
  selectMonthValidation,
  selectMonthWeeks,
} from '../../store/selectors.js';
import { normalizeText } from './gridUtils.js';
import { buildMonthIssues } from './monthUtils.js';

/** Dados derivados do mês atual do setor ativo, compartilhados pelas visões e pelo painel. */
export function useMonthData() {
  const department = useScheduleStore(selectActiveDepartment);
  const allEmployees = useScheduleStore(selectDepartmentEmployees);
  const shifts = useScheduleStore(selectDepartmentShifts);
  const cells = useScheduleStore(selectMonthAssignments);
  const validation = useScheduleStore(selectMonthValidation);
  const weeks = useScheduleStore(selectMonthWeeks);
  const monthKey = useScheduleStore((s) => s.currentMonth);

  const dates = useMemo(() => getMonthGridDates(monthKey), [monthKey]);
  const employees = useMemo(() => allEmployees.filter((e) => e.status !== 'INACTIVE'), [allEmployees]);
  const shiftById = useMemo(() => new Map(shifts.map((s) => [s.id, s])), [shifts]);
  const cellIndex = useMemo(() => new Map(cells.map((a) => [`${a.employeeId}|${a.date}`, a])), [cells]);
  const issues = useMemo(() => buildMonthIssues(validation), [validation]);

  return { department, employees, shifts, cells, validation, weeks, monthKey, dates, shiftById, cellIndex, issues };
}

/** Aplica a busca por nome e o filtro "só com alertas" (contagens de alertas por pessoa). */
export function useFilteredEmployees(employees, filters, counts) {
  const query = normalizeText(useDeferredValue(filters.query).trim());
  return useMemo(
    () =>
      employees.filter((e) => {
        if (query && !normalizeText(e.name).includes(query)) return false;
        if (filters.onlyAlerts && !counts.has(e.id)) return false;
        return true;
      }),
    [employees, query, filters.onlyAlerts, counts],
  );
}
