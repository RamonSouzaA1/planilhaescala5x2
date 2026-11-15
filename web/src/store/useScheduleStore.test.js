import { describe, it, expect, beforeEach } from 'vitest';
import { getWeekDates } from '@escala/shared/utils/dateUtils.js';
import { useScheduleStore, STORAGE_KEY, HISTORY_LIMIT } from './useScheduleStore.js';
import {
  selectCell,
  selectWeekAssignments,
  selectWeekValidation,
  selectDepartmentEmployees,
  selectDepartmentShifts,
  selectDepartmentCoverageRules,
  selectActiveDepartment,
} from './selectors.js';

const store = () => useScheduleStore.getState();
const WEEK = '2026-11-16';

/** Setor + 1 turno + N funcionários. */
function seed(n = 3) {
  const s = store();
  const depId = s.addDepartment({ name: 'Padaria' });
  const shift = s.addShift({ name: 'Abertura', code: 'T1', startTime: '07:00', endTime: '16:24' });
  const emps = s.addEmployeesBulk(Array.from({ length: n }, (_, i) => ({ name: `Func ${i + 1}` })));
  return { depId, shift, emps };
}

beforeEach(() => {
  localStorage.clear();
  store().resetAll();
  store().goToWeek(WEEK);
});

describe('seletores', () => {
  it('seletores de lista alternados mantêm referências estáveis (sem loop de renderização)', () => {
    seed(3);
    const s = store();
    const employees = selectDepartmentEmployees(s);
    const shifts = selectDepartmentShifts(s);
    const rules = selectDepartmentCoverageRules(s);
    expect(selectDepartmentEmployees(s)).toBe(employees);
    expect(selectDepartmentShifts(s)).toBe(shifts);
    expect(selectDepartmentCoverageRules(s)).toBe(rules);
  });
});

describe('desfazer/refazer', () => {
  it('desfaz e refaz uma ação', () => {
    store().addDepartment({ name: 'A' });
    expect(store().canUndo).toBe(true);
    store().undo();
    expect(store().departments).toHaveLength(0);
    expect(store().canRedo).toBe(true);
    store().redo();
    expect(store().departments).toHaveLength(1);
    expect(store().canRedo).toBe(false);
  });
  it('limita o histórico a 50', () => {
    store().addDepartment({ name: 'A' });
    for (let i = 0; i < 60; i += 1) store().addEmployee({ name: `F${i}` });
    expect(store().past).toHaveLength(HISTORY_LIMIT);
    for (let i = 0; i < 100; i += 1) store().undo();
    expect(store().employees).toHaveLength(61 - HISTORY_LIMIT - 1);
    expect(store().canUndo).toBe(false);
  });
  it('nova ação limpa o future', () => {
    store().addDepartment({ name: 'A' });
    store().addDepartment({ name: 'B' });
    store().undo();
    expect(store().canRedo).toBe(true);
    store().addDepartment({ name: 'C' });
    expect(store().future).toHaveLength(0);
    expect(store().canRedo).toBe(false);
  });
  it('navegação e troca de setor não empilham snapshot', () => {
    const a = store().addDepartment({ name: 'A' });
    const b = store().addDepartment({ name: 'B' });
    const before = store().past.length;
    store().nextWeek();
    store().prevWeek();
    store().goToWeek('2026-12-07');
    store().setActiveDepartment(b);
    store().setActiveDepartment(a);
    expect(store().past).toHaveLength(before);
  });
  it('undo/redo sem histórico não fazem nada', () => {
    store().undo();
    store().redo();
    expect(store().departments).toHaveLength(0);
  });
});

describe('persistência', () => {
  it('grava o documento no localStorage sem past/future', () => {
    seed(2);
    store().undo();
    store().redo();
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(saved.version).toBe(1);
    expect(saved.state.employees).toHaveLength(2);
    expect(saved.state).not.toHaveProperty('past');
    expect(saved.state).not.toHaveProperty('future');
    expect(saved.state).not.toHaveProperty('canUndo');
    expect(saved.state.currentWeekStart).toBe(WEEK);
  });
  it('corrige currentWeekStart que não seja segunda-feira ao reidratar', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, state: { departments: [], currentWeekStart: '2026-11-18' } }),
    );
    await useScheduleStore.persist.rehydrate();
    expect(store().currentWeekStart).toBe('2026-11-16');
  });
});

describe('grupos de domingo', () => {
  it('distribui em 3 grupos e recalcula ao incluir, remover e mudar status', () => {
    const { emps } = seed(6);
    expect(store().employees.map((e) => e.sundayGroup)).toEqual([1, 2, 3, 1, 2, 3]);
    store().setEmployeeStatus(emps[0].id, 'VACATION');
    expect(store().employees.filter((e) => e.status === 'ACTIVE').map((e) => e.sundayGroup)).toEqual([1, 2, 3, 1, 2]);
    store().removeEmployee(emps[1].id);
    expect(store().employees.filter((e) => e.status === 'ACTIVE').map((e) => e.sundayGroup)).toEqual([1, 2, 3, 1]);
    store().addEmployee({ name: 'Novo' });
    expect(store().employees.at(-1).sundayGroup).toBe(2);
  });
  it('usa 2 grupos para 1_IN_2', () => {
    const { depId } = seed(5);
    store().updateDepartment(depId, { defaultSundayRule: '1_IN_2' });
    expect(store().employees.map((e) => e.sundayGroup)).toEqual([1, 2, 1, 2, 1]);
  });
  it('não bloqueia mais de 10 funcionários no plano FREE', () => {
    seed(0);
    store().addEmployeesBulk(Array.from({ length: 26 }, (_, i) => ({ name: `P${i}` })));
    expect(store().employees).toHaveLength(26);
  });
});

describe('grade', () => {
  it('setCell e togglePin', () => {
    const { shift, emps } = seed(2);
    const id = emps[0].id;
    store().setCell(id, WEEK, { type: 'WORK', shiftId: shift.id });
    expect(selectCell(store(), id, WEEK)).toMatchObject({ type: 'WORK', shiftId: shift.id, isPinned: false, dayOfWeek: 'SEG' });
    store().togglePin(id, WEEK);
    expect(selectCell(store(), id, WEEK).isPinned).toBe(true);
    store().setCell(id, WEEK, { type: 'OFF' });
    expect(selectCell(store(), id, WEEK)).toMatchObject({ type: 'OFF', isPinned: true, shiftId: undefined });
    store().togglePin(id, WEEK);
    expect(selectCell(store(), id, WEEK).isPinned).toBe(false);
    expect(store().assignments).toHaveLength(1);
    store().setCell(id, '2026-11-17', { type: 'WORK' });
    expect(store().assignments).toHaveLength(1);
  });
  it('generateWeek preserva células travadas e substitui as demais', () => {
    const { shift, emps } = seed(4);
    const [a, b] = emps;
    store().setCell(a.id, WEEK, { type: 'OFF' });
    store().togglePin(a.id, WEEK);
    store().setCell(b.id, '2026-11-17', { type: 'OFF' });
    const result = store().generateWeek();
    expect(result.status).toBeDefined();
    const week = selectWeekAssignments(store());
    expect(week).toHaveLength(4 * 7);
    expect(selectCell(store(), a.id, WEEK)).toMatchObject({ type: 'OFF', isPinned: true });
    expect(selectCell(store(), b.id, '2026-11-17').isPinned).toBe(false);
    expect(week.filter((c) => c.employeeId === b.id && c.type === 'WORK')).toHaveLength(5);
    expect(week.filter((c) => c.type === 'WORK').every((c) => c.shiftId === shift.id)).toBe(true);
    expect(week.every((c) => c.departmentId === store().activeDepartmentId)).toBe(true);
  });
  it('generateWeek sem setor devolve null', () => {
    expect(store().generateWeek()).toBeNull();
  });
  it('duplicatePreviousWeek copia a semana anterior sem travas', () => {
    const { shift, emps } = seed(1);
    const id = emps[0].id;
    store().prevWeek();
    store().setCell(id, '2026-11-09', { type: 'WORK', shiftId: shift.id });
    store().setCell(id, '2026-11-10', { type: 'OFF' });
    store().togglePin(id, '2026-11-09');
    store().nextWeek();
    store().duplicatePreviousWeek();
    expect(selectCell(store(), id, '2026-11-16')).toMatchObject({ type: 'WORK', shiftId: shift.id, isPinned: false });
    expect(selectCell(store(), id, '2026-11-17')).toMatchObject({ type: 'OFF', isPinned: false });
    expect(selectWeekAssignments(store())).toHaveLength(2);
    store().undo();
    expect(selectWeekAssignments(store())).toHaveLength(0);
  });
  it('clearWeek apaga só a semana atual', () => {
    const { shift, emps } = seed(1);
    store().setCell(emps[0].id, WEEK, { type: 'WORK', shiftId: shift.id });
    store().setCell(emps[0].id, '2026-11-23', { type: 'OFF' });
    store().clearWeek();
    expect(store().assignments).toHaveLength(1);
    expect(store().assignments[0].date).toBe('2026-11-23');
  });
  it('removeShift e removeEmployee limpam as células', () => {
    const { shift, emps } = seed(2);
    store().setCell(emps[0].id, WEEK, { type: 'WORK', shiftId: shift.id });
    store().setCell(emps[1].id, WEEK, { type: 'OFF' });
    store().removeShift(shift.id);
    expect(store().assignments).toHaveLength(1);
    store().removeEmployee(emps[1].id);
    expect(store().assignments).toHaveLength(0);
  });
});

describe('navegação', () => {
  it('avança, volta e ajusta para segunda-feira', () => {
    store().nextWeek();
    expect(store().currentWeekStart).toBe('2026-11-23');
    store().prevWeek();
    store().prevWeek();
    expect(store().currentWeekStart).toBe('2026-11-09');
    store().goToWeek('2026-11-19');
    expect(store().currentWeekStart).toBe('2026-11-16');
    store().goToWeek('lixo');
    expect(store().currentWeekStart).toBe('2026-11-16');
  });
  it('a semana inicial é uma segunda-feira', () => {
    store().resetAll();
    expect(new Date(`${store().currentWeekStart}T00:00:00Z`).getUTCDay()).toBe(1);
  });
});

describe('outras ações', () => {
  it('cobertura, ausências e setores', () => {
    const { depId, emps } = seed(1);
    store().upsertCoverageRule({ dayOfWeek: 'SEG', minTotalStaff: 3 });
    store().upsertCoverageRule({ dayOfWeek: 'SEG', minTotalStaff: 5 });
    expect(store().coverageRules).toHaveLength(1);
    expect(store().coverageRules[0].minTotalStaff).toBe(5);
    store().removeCoverageRule(store().coverageRules[0].id);
    expect(store().coverageRules).toHaveLength(0);
    const ab = store().addAbsence({ employeeId: emps[0].id, type: 'VACATION', startDate: WEEK, endDate: '2026-11-20' });
    store().removeAbsence(ab.id);
    expect(store().absences).toHaveLength(0);
    expect(selectActiveDepartment(store()).id).toBe(depId);
    store().removeDepartment(depId);
    expect(store().activeDepartmentId).toBeNull();
    expect(store().employees).toHaveLength(0);
  });
});

describe('Loja Exemplo', () => {
  it('generateWeek resulta em GREEN com 26x7 células', () => {
    store().loadSampleStore();
    store().goToWeek(WEEK);
    expect(selectDepartmentEmployees(store())).toHaveLength(26);
    const validation = store().generateWeek();
    expect(validation.issues.map((i) => i.message)).toEqual([]);
    expect(validation.status).toBe('GREEN');
    expect(selectWeekAssignments(store())).toHaveLength(26 * 7);
    expect(selectWeekValidation(store()).status).toBe('GREEN');
  });
  it('fica GREEN em várias semanas seguidas (usa a semana anterior)', () => {
    store().loadSampleStore();
    store().goToWeek(WEEK);
    for (let i = 0; i < 6; i += 1) {
      expect(store().generateWeek().status).toBe('GREEN');
      expect(selectWeekValidation(store()).status).toBe('GREEN');
      store().nextWeek();
    }
  });
  it('distribuição de pessoas por dia atende a cobertura', () => {
    store().loadSampleStore();
    store().goToWeek(WEEK);
    store().generateWeek();
    const counts = getWeekDates(WEEK).map(
      (d) => selectWeekAssignments(store()).filter((c) => c.date === d && c.type === 'WORK').length,
    );
    console.info('Pessoas por dia (SEG..DOM):', counts.join(', '));
    const mins = [14, 14, 14, 16, 20, 20, 15];
    counts.forEach((c, i) => expect(c).toBeGreaterThanOrEqual(mins[i]));
  });
  it('loadSampleStore pode ser desfeito', () => {
    store().loadSampleStore();
    store().undo();
    expect(store().employees).toHaveLength(0);
  });
});
