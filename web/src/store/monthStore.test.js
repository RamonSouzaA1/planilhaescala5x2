import { describe, it, expect, beforeEach } from 'vitest';
import { getWeekDates } from '@escala/shared/utils/dateUtils.js';
import { getMonthGridDates, getMonthWeeks } from '@escala/shared/utils/monthSchedule.js';
import { useScheduleStore, STORAGE_KEY, getMonday } from './useScheduleStore.js';
import {
  selectMonthAssignments,
  selectMonthValidation,
  selectMonthWeeks,
  selectWeekAssignments,
  selectWeekValidation,
} from './selectors.js';

/** F13 (parte 1): estado e ações da visualização mensal. */

const store = () => useScheduleStore.getState();
const WEEK = '2026-11-16';
const DECEMBER_WEEKS = ['2026-11-30', '2026-12-07', '2026-12-14', '2026-12-21', '2026-12-28'];

function seed(n = 3) {
  const s = store();
  const depId = s.addDepartment({ name: 'Padaria' });
  const shift = s.addShift({ name: 'Abertura', code: 'T1', startTime: '07:00', endTime: '16:24' });
  const emps = s.addEmployeesBulk(Array.from({ length: n }, (_, i) => ({ name: `Func ${i + 1}` })));
  return { depId, shift, emps };
}

const cellOf = (employeeId, date) => store().assignments.find((a) => a.employeeId === employeeId && a.date === date);

beforeEach(() => {
  localStorage.clear();
  store().resetAll();
  store().goToWeek(WEEK);
});

describe('estado inicial e modo de visualização', () => {
  it('começa em semana, com o mês da semana atual', () => {
    expect(store().viewMode).toBe('week');
    expect(store().currentMonth).toBe('2026-11');
  });

  it('setViewMode alterna entre semana e mês e ignora valores inválidos', () => {
    store().setViewMode('month');
    expect(store().viewMode).toBe('month');
    store().setViewMode('year');
    expect(store().viewMode).toBe('month');
    store().setViewMode('week');
    expect(store().viewMode).toBe('week');
  });

  it('resetAll volta para semana', () => {
    store().setViewMode('month');
    store().resetAll();
    expect(store().viewMode).toBe('week');
  });
});

describe('navegação por mês', () => {
  it('goToMonth vai para a segunda da primeira semana do mês', () => {
    store().goToMonth('2026-12');
    expect(store().currentMonth).toBe('2026-12');
    expect(store().currentWeekStart).toBe('2026-11-30');
    store().goToMonth('2026-08');
    expect(store().currentWeekStart).toBe('2026-07-27');
  });

  it('goToMonth ignora mês inválido', () => {
    store().goToMonth('2026-13');
    store().goToMonth('dez/2026');
    expect(store().currentMonth).toBe('2026-11');
    expect(store().currentWeekStart).toBe(WEEK);
  });

  it('nextMonth e prevMonth atravessam o ano e mantêm a semana coerente', () => {
    store().goToMonth('2026-12');
    store().nextMonth();
    expect(store().currentMonth).toBe('2027-01');
    expect(store().currentWeekStart).toBe(getMonthWeeks('2027-01')[0]);
    store().prevMonth();
    store().prevMonth();
    expect(store().currentMonth).toBe('2026-11');
    expect(store().currentWeekStart).toBe('2026-10-26');
  });

  it('mudar de semana deriva o mês, mantendo-o enquanto a semana ainda toca o mês atual', () => {
    store().goToMonth('2026-12'); // semana de 30/11, que também toca novembro
    expect(store().currentMonth).toBe('2026-12');
    store().prevWeek(); // 23/11: só novembro
    expect(store().currentMonth).toBe('2026-11');
    store().nextWeek(); // 30/11: ainda toca novembro
    expect(store().currentMonth).toBe('2026-11');
    store().nextWeek(); // 07/12
    expect(store().currentMonth).toBe('2026-12');
    store().goToWeek('2027-03-10');
    expect(store().currentWeekStart).toBe('2027-03-08');
    expect(store().currentMonth).toBe('2027-03');
  });

  it('navegação e modo de visualização não criam passo de desfazer', () => {
    seed(1);
    const before = store().past.length;
    store().setViewMode('month');
    store().goToMonth('2026-12');
    store().nextMonth();
    store().prevMonth();
    store().nextWeek();
    store().prevWeek();
    store().goToWeek('2026-12-14');
    store().setViewMode('week');
    expect(store().past).toHaveLength(before);
    expect(store().future).toHaveLength(0);
  });

  it('desfazer não muda o modo nem o mês', () => {
    seed(1);
    store().setViewMode('month');
    store().goToMonth('2027-02');
    store().undo();
    expect(store().viewMode).toBe('month');
    expect(store().currentMonth).toBe('2027-02');
  });
});

describe('persistência de viewMode e currentMonth', () => {
  it('grava viewMode e currentMonth no localStorage', () => {
    store().setViewMode('month');
    store().goToMonth('2026-12');
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)).state;
    expect(saved.viewMode).toBe('month');
    expect(saved.currentMonth).toBe('2026-12');
    expect(saved.currentWeekStart).toBe('2026-11-30');
  });

  it('reidrata valores válidos', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, state: { departments: [], currentWeekStart: '2026-11-30', currentMonth: '2026-12', viewMode: 'month' } }),
    );
    await useScheduleStore.persist.rehydrate();
    expect(store().viewMode).toBe('month');
    expect(store().currentMonth).toBe('2026-12');
  });

  it('cai no padrão quando viewMode ou currentMonth são inválidos', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, state: { departments: [], currentWeekStart: '2026-12-09', currentMonth: '2026-99', viewMode: 'ano' } }),
    );
    await useScheduleStore.persist.rehydrate();
    expect(store().viewMode).toBe('week');
    expect(store().currentWeekStart).toBe('2026-12-07');
    expect(store().currentMonth).toBe('2026-12');
  });

  it('dados antigos sem os campos novos derivam o mês da semana salva', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, state: { departments: [], currentWeekStart: '2027-02-01' } }));
    await useScheduleStore.persist.rehydrate();
    expect(store().viewMode).toBe('week');
    expect(store().currentMonth).toBe('2027-02');
  });
});

describe('generateMonth', () => {
  it('sem setor devolve null e não cria passo de desfazer', () => {
    expect(store().generateMonth()).toBeNull();
    expect(store().past).toHaveLength(0);
  });

  it('Loja Exemplo: gera dezembro inteiro verde, em um único passo de desfazer', () => {
    store().loadSampleStore();
    store().goToMonth('2026-12');
    const before = store().past.length;
    const result = store().generateMonth();
    expect(result.weeks.map((w) => w.weekStartDate)).toEqual(DECEMBER_WEEKS);
    expect(result.weeks.flatMap((w) => w.validation.issues.map((i) => i.message))).toEqual([]);
    expect(result.summary).toEqual({ red: 0, yellow: 0, total: 0, status: 'GREEN' });
    expect(store().past).toHaveLength(before + 1);
    expect(selectMonthAssignments(store())).toHaveLength(26 * 7 * DECEMBER_WEEKS.length);
    expect(selectMonthValidation(store())).toEqual(result);

    store().undo();
    expect(selectMonthAssignments(store())).toHaveLength(0);
    expect(store().past).toHaveLength(before);
    store().redo();
    expect(selectMonthAssignments(store())).toHaveLength(26 * 7 * DECEMBER_WEEKS.length);
  });

  it('Loja Exemplo: novembro também fica verde e cada semana confere com a validação semanal', () => {
    store().loadSampleStore();
    store().goToMonth('2026-11');
    expect(store().generateMonth().summary.status).toBe('GREEN');
    for (const week of getMonthWeeks('2026-11')) {
      store().goToWeek(week);
      expect(selectWeekValidation(store()).status).toBe('GREEN');
    }
  });

  it('encadeia com a semana anterior ao mês já gravada', () => {
    store().loadSampleStore();
    store().goToWeek('2026-11-23');
    store().generateWeek();
    store().goToMonth('2026-12');
    expect(store().generateMonth().summary.status).toBe('GREEN');
  });

  it('preserva travadas, substitui as demais e não mexe fora das semanas do mês nem em outro setor', () => {
    const { depId, shift, emps } = seed(3);
    const [a, b] = emps;
    store().goToWeek('2026-11-23');
    store().setCell(a.id, '2026-11-23', { type: 'WORK', shiftId: shift.id }); // fora do mês de dezembro
    store().setCell(a.id, '2026-12-09', { type: 'OFF' });
    store().togglePin(a.id, '2026-12-09');
    store().setCell(b.id, '2026-12-15', { type: 'ABSENCE' }); // não travada
    const otherDep = store().addDepartment({ name: 'Outro' });
    store().setActiveDepartment(otherDep);
    const [other] = store().addEmployeesBulk([{ name: 'Fulano', departmentId: otherDep }]);
    store().setCell(other.id, '2026-12-10', { type: 'OFF' });
    store().setActiveDepartment(depId);

    store().goToMonth('2026-12');
    store().generateMonth();

    expect(cellOf(a.id, '2026-11-23')).toMatchObject({ type: 'WORK', shiftId: shift.id });
    expect(cellOf(a.id, '2026-12-09')).toMatchObject({ type: 'OFF', isPinned: true });
    expect(cellOf(b.id, '2026-12-15').type).not.toBe('ABSENCE');
    expect(cellOf(other.id, '2026-12-10')).toMatchObject({ type: 'OFF', departmentId: otherDep });
    const month = selectMonthAssignments(store());
    expect(month).toHaveLength(3 * 7 * DECEMBER_WEEKS.length);
    expect(month.every((c) => c.departmentId === depId)).toBe(true);
    expect(new Set(month.map((c) => `${c.employeeId}|${c.date}`)).size).toBe(month.length);
    expect(month.every((c) => c.scheduleCycleId === `${depId}_${getMonday(c.date)}`)).toBe(true);
  });

  it('respeita ausências do setor no meio do mês', () => {
    const { emps } = seed(4);
    store().addAbsence({ employeeId: emps[0].id, type: 'VACATION', startDate: '2026-12-10', endDate: '2026-12-20' });
    store().goToMonth('2026-12');
    store().generateMonth();
    for (const date of getMonthGridDates('2026-12')) {
      const inVacation = date >= '2026-12-10' && date <= '2026-12-20';
      expect(cellOf(emps[0].id, date).type === 'ABSENCE', date).toBe(inVacation);
    }
  });

  it('generateWeek e duplicatePreviousWeek continuam funcionando depois de gerar o mês', () => {
    seed(3);
    store().goToMonth('2026-12');
    store().generateMonth();
    store().goToWeek('2027-01-04');
    expect(store().generateWeek()).not.toBeNull();
    expect(selectWeekAssignments(store())).toHaveLength(3 * 7);
    store().goToWeek('2027-01-11');
    store().duplicatePreviousWeek();
    expect(selectWeekAssignments(store())).toHaveLength(3 * 7);
  });
});

describe('clearMonth', () => {
  it('apaga as semanas do mês, inclusive travadas, em um passo de desfazer', () => {
    const { shift, emps } = seed(2);
    store().goToMonth('2026-12');
    store().generateMonth();
    store().togglePin(emps[0].id, '2026-12-10');
    store().setCell(emps[0].id, '2027-01-04', { type: 'WORK', shiftId: shift.id }); // fora do mês
    const before = store().past.length;
    store().clearMonth();
    expect(selectMonthAssignments(store())).toHaveLength(0);
    expect(cellOf(emps[0].id, '2027-01-04')).toBeDefined();
    expect(store().past).toHaveLength(before + 1);
    store().undo();
    expect(selectMonthAssignments(store())).toHaveLength(2 * 7 * DECEMBER_WEEKS.length);
    expect(cellOf(emps[0].id, '2026-12-10').isPinned).toBe(true);
  });

  it('sem células no mês não cria passo de desfazer', () => {
    seed(1);
    store().goToMonth('2026-12');
    const before = store().past.length;
    store().clearMonth();
    expect(store().past).toHaveLength(before);
  });
});

describe('seletores mensais', () => {
  it('selectMonthWeeks lista as segundas do mês atual com referência estável', () => {
    store().goToMonth('2026-12');
    const weeks = selectMonthWeeks(store());
    expect(weeks).toEqual(DECEMBER_WEEKS);
    expect(selectMonthWeeks(store())).toBe(weeks);
    store().goToMonth('2026-11');
    expect(selectMonthWeeks(store())).toHaveLength(6);
  });

  it('selectMonthAssignments e selectMonthValidation são memoizados', () => {
    seed(2);
    store().goToMonth('2026-12');
    store().generateMonth();
    const cells = selectMonthAssignments(store());
    const validation = selectMonthValidation(store());
    expect(selectMonthAssignments(store())).toBe(cells);
    expect(selectMonthValidation(store())).toBe(validation);
    expect(cells.every((c) => getMonthGridDates('2026-12').includes(c.date))).toBe(true);
  });

  it('selectMonthValidation é null sem setor e reflete edições manuais', () => {
    expect(selectMonthValidation(store())).toBeNull();
    const { shift, emps } = seed(1);
    store().goToMonth('2026-12');
    store().generateMonth();
    expect(selectMonthValidation(store()).summary.red).toBe(0);
    // Sete dias seguidos em uma semana do mês.
    for (const date of getWeekDates('2026-12-14')) store().setCell(emps[0].id, date, { type: 'WORK', shiftId: shift.id });
    const validation = selectMonthValidation(store());
    expect(validation.summary.status).toBe('RED');
    expect(validation.weeks.find((w) => w.weekStartDate === '2026-12-14').validation.status).toBe('RED');
  });
});
