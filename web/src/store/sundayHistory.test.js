import { describe, it, expect, beforeEach } from 'vitest';
import { addDays } from '@escala/shared/utils/dateUtils.js';
import { useScheduleStore } from './useScheduleStore.js';
import { selectWeekValidation } from './selectors.js';

/**
 * Regra dos três domingos seguidos (Lei 10.101/2000, art. 6º) no front-end: o store e o
 * seletor de validação passam a semana retrasada para o gerador e o validador.
 */

const store = () => useScheduleStore.getState();
const W1 = '2026-11-30';
const W2 = '2026-12-07';
const W3 = '2026-12-14';

function seed() {
  const s = store();
  s.addDepartment({ name: 'Padaria', defaultSundayRule: 'CUSTOM', weeklyHoursTarget: 42 });
  const shift = s.addShift({ name: 'Abertura', code: 'T1', startTime: '07:00', endTime: '16:24' });
  const [employee] = s.addEmployeesBulk([{ name: 'Ana' }]);
  return { shift, employee };
}

/** Quarta a domingo trabalhados, segunda e terça de folga. */
function fillSundayWorkWeek(employeeId, shiftId, weekStart) {
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(weekStart, i);
    store().setCell(employeeId, date, i < 2 ? { type: 'OFF' } : { type: 'WORK', shiftId });
  }
}

const sundayLaw = (validation) => validation.issues.filter((i) => i.code === 'SUNDAY_LAW');

beforeEach(() => {
  localStorage.clear();
  store().resetAll();
});

describe('histórico de dois domingos no front-end', () => {
  it('selectWeekValidation aponta o 3º domingo seguido trabalhado', () => {
    const { shift, employee } = seed();
    for (const week of [W1, W2, W3]) fillSundayWorkWeek(employee.id, shift.id, week);
    store().goToWeek(W3);
    const issues = sundayLaw(selectWeekValidation(store()));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: 'RED', employeeId: employee.id, date: addDays(W3, 6) });
  });

  it('generateWeek usa a semana retrasada e dá folga no 3º domingo', () => {
    const { shift, employee } = seed();
    fillSundayWorkWeek(employee.id, shift.id, W1);
    fillSundayWorkWeek(employee.id, shift.id, W2);
    store().goToWeek(W3);
    const validation = store().generateWeek();
    expect(sundayLaw(validation)).toEqual([]);
    const sunday = store().assignments.find((a) => a.employeeId === employee.id && a.date === addDays(W3, 6));
    expect(sunday.type).toBe('OFF');
  });
});
