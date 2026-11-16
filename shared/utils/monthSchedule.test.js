import { describe, it, expect } from 'vitest';
import {
  addMonths,
  generateMonth,
  getMonthDates,
  getMonthGridDates,
  getMonthKey,
  getMonthWeeks,
  isMonthKey,
  validateMonth,
} from './monthSchedule.js';
import { generateSchedule } from './scheduleGenerator.js';
import { ISSUE_CODES } from './cltValidator.js';
import { addDays, getWeekDates, isMonday } from './dateUtils.js';
import { assignSundayGroups } from './sundayRotation.js';

const SHIFTS = [
  { id: 'T1', code: 'T1', name: 'Abertura', startTime: '07:00', endTime: '16:24', breakDurationMinutes: 60 },
  { id: 'T2', code: 'T2', name: 'Intermediário', startTime: '10:00', endTime: '19:24', breakDurationMinutes: 60 },
  { id: 'T3', code: 'T3', name: 'Fechamento', startTime: '12:36', endTime: '22:00', breakDurationMinutes: 60 },
];
const DEPARTMENT = { id: 'dep', defaultSundayRule: '1_IN_3', weeklyHoursTarget: 42 };

/** Mesma configuração da Loja Exemplo (web/src/store/sampleStore.js): 26 pessoas, 3 líderes, 5 na serra. */
const MIN_STAFF = { SEG: 14, TER: 14, QUA: 14, QUI: 16, SEX: 20, SAB: 20, DOM: 15 };
const SAMPLE_COVERAGE = Object.entries(MIN_STAFF).map(([dayOfWeek, minTotalStaff]) => ({
  id: `cov-${dayOfWeek}`,
  dayOfWeek,
  minTotalStaff,
  requiredTags: [
    { tag: 'Líder', minCount: 1 },
    { tag: 'Serra', minCount: 1 },
  ],
  peakHours: dayOfWeek === 'SEX' || dayOfWeek === 'SAB' ? [{ start: '11:00', end: '14:00', minStaff: 12 }] : [],
}));

function team(n, extra = () => ({})) {
  const employees = Array.from({ length: n }, (_, i) => ({
    id: `e${String(i).padStart(3, '0')}`,
    name: `Pessoa ${i}`,
    tags: [],
    status: 'ACTIVE',
    ...extra(i),
  }));
  const groups = assignSundayGroups(employees);
  return employees.map((e) => ({ sundayGroup: groups[e.id], ...e }));
}

const sampleTeam = () => team(26, (i) => ({ tags: i < 3 ? ['Líder'] : i < 8 ? ['Serra'] : [] }));

function sampleMonth(monthKey, overrides = {}) {
  return generateMonth({
    monthKey,
    employees: sampleTeam(),
    shifts: SHIFTS,
    coverageRules: SAMPLE_COVERAGE,
    department: DEPARTMENT,
    ...overrides,
  });
}

const redIssues = (result) => result.weeks.flatMap((w) => w.validation.issues.filter((i) => i.severity === 'RED'));
const cell = (assignments, employeeId, date) => assignments.find((a) => a.employeeId === employeeId && a.date === date);

describe('datas do mês', () => {
  it('isMonthKey aceita só YYYY-MM com mês de 01 a 12', () => {
    expect(isMonthKey('2026-11')).toBe(true);
    for (const bad of ['2026-13', '2026-00', '2026-1', '26-11', '2026-11-01', '', null, undefined, 202611]) {
      expect(isMonthKey(bad)).toBe(false);
    }
  });

  it('getMonthKey extrai o mês de uma data (inclusive ISO da API)', () => {
    expect(getMonthKey('2026-11-16')).toBe('2026-11');
    expect(getMonthKey('2026-12-01T00:00:00.000Z')).toBe('2026-12');
    expect(() => getMonthKey('16/11/2026')).toThrow(/data inválida/i);
  });

  it('addMonths avança e volta, atravessando o ano', () => {
    expect(addMonths('2026-11', 1)).toBe('2026-12');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-11', -23)).toBe('2024-12');
    expect(addMonths('2026-11', 0)).toBe('2026-11');
  });

  it('getMonthDates devolve os dias do mês (inclusive 29/02 em ano bissexto)', () => {
    expect(getMonthDates('2026-11')).toHaveLength(30);
    expect(getMonthDates('2026-11')[0]).toBe('2026-11-01');
    expect(getMonthDates('2026-11').at(-1)).toBe('2026-11-30');
    expect(getMonthDates('2026-02')).toHaveLength(28);
    expect(getMonthDates('2028-02').at(-1)).toBe('2028-02-29');
  });

  it.each([
    ['2021-02', ['2021-02-01', '2021-02-08', '2021-02-15', '2021-02-22']], // 4 semanas (começa na segunda)
    ['2026-02', ['2026-01-26', '2026-02-02', '2026-02-09', '2026-02-16', '2026-02-23']], // 5
    ['2026-12', ['2026-11-30', '2026-12-07', '2026-12-14', '2026-12-21', '2026-12-28']], // 5
    ['2026-11', ['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']], // 6
    ['2026-08', ['2026-07-27', '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31']], // 6
  ])('getMonthWeeks(%s) lista as segundas das semanas que tocam o mês', (monthKey, weeks) => {
    expect(getMonthWeeks(monthKey)).toEqual(weeks);
    expect(getMonthWeeks(monthKey).every(isMonday)).toBe(true);
  });

  it('getMonthGridDates cobre as semanas inteiras, em ordem', () => {
    const grid = getMonthGridDates('2026-11');
    expect(grid).toHaveLength(6 * 7);
    expect(grid[0]).toBe('2026-10-26');
    expect(grid.at(-1)).toBe('2026-12-06');
    expect(grid).toEqual([...grid].sort());
    expect(grid).toEqual(expect.arrayContaining(getMonthDates('2026-11')));
  });

  it('rejeita monthKey inválido com mensagem clara', () => {
    for (const fn of [getMonthWeeks, getMonthDates, getMonthGridDates, (k) => addMonths(k, 1)]) {
      expect(() => fn('2026-13')).toThrow(/mês inválido.*YYYY-MM/i);
      expect(() => fn('nov/2026')).toThrow(/mês inválido/i);
    }
    expect(() => generateMonth({ monthKey: '2026/11', employees: [] })).toThrow(/mês inválido/i);
    expect(() => validateMonth({ monthKey: undefined, employees: [] })).toThrow(/mês inválido/i);
  });
});

describe('generateMonth — loja exemplo (26 pessoas, 3 turnos, cobertura)', () => {
  it.each(['2026-11', '2026-12'])('gera %s inteiro sem alertas vermelhos', (monthKey) => {
    const result = sampleMonth(monthKey);
    const weeks = getMonthWeeks(monthKey);
    expect(result.weeks.map((w) => w.weekStartDate)).toEqual(weeks);
    expect(result.assignments).toHaveLength(26 * 7 * weeks.length);
    expect(redIssues(result).map((i) => i.message)).toEqual([]);
    expect(result.summary.red).toBe(0);
    expect(result.summary.status).not.toBe('RED');
  });

  it('dezembro/2026 cruza o teto de 42h (15/12) sem WEEKLY_HOURS', () => {
    const result = sampleMonth('2026-12');
    const codes = result.weeks.flatMap((w) => w.validation.issues.map((i) => i.code));
    expect(codes).not.toContain(ISSUE_CODES.WEEKLY_HOURS);
  });

  it('cada pessoa tem 5 dias de trabalho e 2 folgas em todas as semanas', () => {
    const result = sampleMonth('2026-11');
    for (const weekStart of getMonthWeeks('2026-11')) {
      const dates = getWeekDates(weekStart);
      for (const e of sampleTeam()) {
        const types = dates.map((d) => cell(result.assignments, e.id, d).type);
        expect(types.filter((t) => t === 'WORK'), `${e.id} ${weekStart}`).toHaveLength(5);
      }
    }
  });

  it('nunca passa de 6 dias seguidos na virada entre as semanas do mês', () => {
    const result = sampleMonth('2026-11');
    const grid = getMonthGridDates('2026-11');
    for (const e of sampleTeam()) {
      let run = 0;
      for (const date of grid) {
        run = cell(result.assignments, e.id, date).type === 'WORK' ? run + 1 : 0;
        expect(run, `${e.id} ${date}`).toBeLessThanOrEqual(6);
      }
    }
  });

  it('é determinístico', () => {
    expect(sampleMonth('2026-11')).toEqual(sampleMonth('2026-11'));
  });

  it('N = 26 em menos de 1 s', () => {
    const start = performance.now();
    sampleMonth('2026-11');
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it('encadeia: cada semana usa a anterior gerada (igual a gerar semana a semana)', () => {
    const employees = sampleTeam();
    const result = sampleMonth('2026-12');
    const chained = [];
    for (const weekStartDate of getMonthWeeks('2026-12')) {
      const prev = chained.at(-1) ?? [];
      const earlier = chained.at(-2) ?? [];
      const week = generateSchedule({
        weekStartDate,
        employees,
        shifts: SHIFTS,
        coverageRules: SAMPLE_COVERAGE,
        department: DEPARTMENT,
        previousAssignments: prev,
        earlierAssignments: earlier,
      });
      chained.push(week.assignments);
    }
    expect(result.assignments).toEqual(chained.flat());
  });
});

describe('generateMonth — tamanhos de equipe', () => {
  it('N = 7 sem alertas vermelhos', () => {
    const result = generateMonth({ monthKey: '2026-11', employees: team(7), shifts: SHIFTS, department: DEPARTMENT });
    expect(redIssues(result)).toEqual([]);
  });

  it('N = 200 em menos de 3 s, sem alertas vermelhos', () => {
    const employees = team(200, (i) => (i % 20 === 0 ? { tags: ['Líder'] } : {}));
    const start = performance.now();
    const result = generateMonth({ monthKey: '2026-12', employees, shifts: SHIFTS, department: DEPARTMENT });
    expect(performance.now() - start).toBeLessThan(3000);
    expect(redIssues(result)).toEqual([]);
    expect(result.assignments).toHaveLength(200 * 7 * 5);
  });

  it('equipe vazia gera mês vazio e verde', () => {
    const result = generateMonth({ monthKey: '2026-11', employees: [], shifts: SHIFTS });
    expect(result.assignments).toEqual([]);
    expect(result.weeks).toHaveLength(6);
    expect(result.summary).toEqual({ red: 0, yellow: 0, total: 0, status: 'GREEN' });
  });
});

describe('generateMonth — contexto, travas e ausências', () => {
  it('usa previousAssignments na primeira semana: 6 dias seguidos antes do mês obrigam folga na segunda', () => {
    const employees = team(4);
    const prevWeek = getWeekDates('2026-11-23'); // semana anterior à primeira de dezembro (30/11)
    const previousAssignments = prevWeek.map((date, i) => ({
      employeeId: 'e000',
      date,
      type: i === 0 ? 'OFF' : 'WORK',
      shiftId: i === 0 ? undefined : 'T1',
    }));
    const result = generateMonth({ monthKey: '2026-12', employees, shifts: SHIFTS, department: DEPARTMENT, previousAssignments });
    expect(cell(result.assignments, 'e000', '2026-11-30').type).toBe('OFF');
    expect(redIssues(result)).toEqual([]);
  });

  it('valida a primeira semana com a anterior: célula travada que viola a virada aparece no resumo', () => {
    const employees = team(2);
    const previousAssignments = getWeekDates('2026-11-23').map((date) => ({
      employeeId: 'e000',
      date,
      type: 'WORK',
      shiftId: 'T3',
    }));
    // Sete dias antes + segunda travada como trabalho: infração inevitável na primeira semana.
    const existingAssignments = [{ employeeId: 'e000', date: '2026-11-30', type: 'WORK', shiftId: 'T1', isPinned: true }];
    const result = generateMonth({
      monthKey: '2026-12',
      employees,
      shifts: SHIFTS,
      department: DEPARTMENT,
      previousAssignments,
      existingAssignments,
    });
    expect(result.weeks[0].validation.status).toBe('RED');
    expect(result.summary.red).toBeGreaterThan(0);
    expect(result.summary.status).toBe('RED');
  });

  it('preserva células travadas de qualquer semana e substitui as demais', () => {
    const employees = team(5);
    const existingAssignments = [
      { employeeId: 'e001', date: '2026-12-09', type: 'OFF', isPinned: true },
      { employeeId: 'e001', date: '2026-12-10', type: 'WORK', shiftId: 'T3', isPinned: true },
      { employeeId: 'e002', date: '2026-12-22', type: 'WORK', shiftId: 'T2', isPinned: true },
      { employeeId: 'e003', date: '2026-12-15', type: 'ABSENCE', isPinned: false }, // não travada: substituída
    ];
    const result = generateMonth({ monthKey: '2026-12', employees, shifts: SHIFTS, department: DEPARTMENT, existingAssignments });
    expect(cell(result.assignments, 'e001', '2026-12-09')).toMatchObject({ type: 'OFF', isPinned: true });
    expect(cell(result.assignments, 'e001', '2026-12-10')).toMatchObject({ type: 'WORK', shiftId: 'T3', isPinned: true });
    expect(cell(result.assignments, 'e002', '2026-12-22')).toMatchObject({ type: 'WORK', shiftId: 'T2', isPinned: true });
    expect(cell(result.assignments, 'e003', '2026-12-15').type).not.toBe('ABSENCE');
    expect(redIssues(result)).toEqual([]);
  });

  it('respeita a abertura travada na segunda da semana seguinte do mês (descanso na virada)', () => {
    const employees = team(3);
    // Todos travados em T1 na segunda 07/12: o domingo 06/12 não pode terminar às 22h.
    const existingAssignments = employees.map((e) => ({
      employeeId: e.id,
      date: '2026-12-07',
      type: 'WORK',
      shiftId: 'T1',
      isPinned: true,
    }));
    const result = generateMonth({ monthKey: '2026-12', employees, shifts: SHIFTS, department: DEPARTMENT, existingAssignments });
    for (const e of employees) {
      const sunday = cell(result.assignments, e.id, '2026-12-06');
      if (sunday.type === 'WORK') expect(sunday.shiftId).not.toBe('T3');
    }
    expect(redIssues(result)).toEqual([]);
  });

  it('ausências e férias no meio do mês viram ABSENCE só nos dias delas', () => {
    const employees = team(6);
    const absences = [
      { id: 'a1', employeeId: 'e000', type: 'VACATION', startDate: '2026-12-10', endDate: '2026-12-23' },
      { id: 'a2', employeeId: 'e004', type: 'MEDICAL', startDate: '2026-12-16', endDate: '2026-12-17' },
    ];
    const result = generateMonth({ monthKey: '2026-12', employees, shifts: SHIFTS, department: DEPARTMENT, absences });
    for (const date of getMonthGridDates('2026-12')) {
      const vacation = date >= '2026-12-10' && date <= '2026-12-23';
      expect(cell(result.assignments, 'e000', date).type === 'ABSENCE', date).toBe(vacation);
      const medical = date === '2026-12-16' || date === '2026-12-17';
      expect(cell(result.assignments, 'e004', date).type === 'ABSENCE', date).toBe(medical);
    }
    expect(redIssues(result)).toEqual([]);
  });

  it('respeita nextAssignments já gravados depois do mês (última semana)', () => {
    const employees = team(3);
    const nextWeek = addDays('2026-12-28', 7); // 04/01/2027
    const nextAssignments = employees.flatMap((e) =>
      getWeekDates(nextWeek).map((date, i) => ({
        employeeId: e.id,
        date,
        type: i < 5 ? 'WORK' : 'OFF',
        shiftId: i < 5 ? 'T1' : undefined,
      })),
    );
    const result = generateMonth({ monthKey: '2026-12', employees, shifts: SHIFTS, department: DEPARTMENT, nextAssignments });
    expect(redIssues(result)).toEqual([]);
    for (const e of employees) {
      // 5 dias seguidos logo no início da semana seguinte: a sequência na virada fica no máximo em 6.
      let run = 5;
      for (const date of [...getWeekDates('2026-12-28')].reverse()) {
        if (cell(result.assignments, e.id, date).type !== 'WORK') break;
        run += 1;
      }
      expect(run).toBeLessThanOrEqual(6);
      const sunday = cell(result.assignments, e.id, '2027-01-03');
      if (sunday.type === 'WORK') expect(sunday.shiftId).not.toBe('T3');
    }
  });

  it('ignora contexto fora das datas esperadas', () => {
    const employees = team(3);
    const base = generateMonth({ monthKey: '2026-12', employees, shifts: SHIFTS, department: DEPARTMENT });
    const noise = [{ employeeId: 'e000', date: '2026-06-01', type: 'WORK', shiftId: 'T3' }];
    const withNoise = generateMonth({
      monthKey: '2026-12',
      employees,
      shifts: SHIFTS,
      department: DEPARTMENT,
      previousAssignments: noise,
      earlierAssignments: noise,
      nextAssignments: noise,
      existingAssignments: noise.map((a) => ({ ...a, isPinned: true })),
    });
    expect(withNoise.assignments).toEqual(base.assignments);
  });
});

describe('validateMonth', () => {
  it('reproduz a validação do generateMonth a partir das células', () => {
    const employees = sampleTeam();
    const generated = sampleMonth('2026-11', { employees });
    const validated = validateMonth({
      monthKey: '2026-11',
      employees,
      shifts: SHIFTS,
      coverageRules: SAMPLE_COVERAGE,
      department: DEPARTMENT,
      assignments: generated.assignments,
    });
    expect(validated).toEqual({ weeks: generated.weeks, summary: generated.summary });
  });

  it('usa as semanas anterior e retrasada do próprio conjunto para a primeira semana', () => {
    const employees = team(1);
    // 7 dias seguidos que atravessam a virada entre a semana anterior (23/11) e a primeira de dezembro (30/11).
    const work = (date) => ({ employeeId: 'e000', date, type: 'WORK', shiftId: 'T1' });
    const assignments = ['2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01'].map(work);
    const result = validateMonth({ monthKey: '2026-12', employees, shifts: SHIFTS, department: DEPARTMENT, assignments });
    const codes = result.weeks[0].validation.issues.map((i) => i.code);
    expect(codes).toContain(ISSUE_CODES.CONSECUTIVE_DAYS);
  });

  it('virada entre duas semanas do mês: aparece nas duas semanas, mas conta uma vez no resumo', () => {
    const employees = team(1);
    // Domingo 13/12 até 22h e segunda 14/12 às 07h: 9h de descanso.
    const assignments = [
      { employeeId: 'e000', date: '2026-12-13', type: 'WORK', shiftId: 'T3' },
      { employeeId: 'e000', date: '2026-12-14', type: 'WORK', shiftId: 'T1' },
    ];
    const result = validateMonth({ monthKey: '2026-12', employees, shifts: SHIFTS, department: DEPARTMENT, assignments });
    const interjornada = (w) => w.validation.issues.filter((i) => i.code === ISSUE_CODES.INTERJORNADA);
    const byWeek = Object.fromEntries(result.weeks.map((w) => [w.weekStartDate, interjornada(w).length]));
    expect(byWeek['2026-12-07']).toBe(1); // apontada no domingo, olhando a semana seguinte
    expect(byWeek['2026-12-14']).toBe(1); // apontada na segunda, olhando a semana anterior
    const allRed = result.weeks.reduce((sum, w) => sum + w.validation.summary.red, 0);
    expect(result.summary.red).toBe(allRed - 1);
  });

  it('virada do último domingo para a semana seguinte ao mês conta no resumo', () => {
    const employees = team(1);
    const assignments = [
      { employeeId: 'e000', date: '2027-01-03', type: 'WORK', shiftId: 'T3' },
      { employeeId: 'e000', date: '2027-01-04', type: 'WORK', shiftId: 'T1' },
    ];
    const result = validateMonth({ monthKey: '2026-12', employees, shifts: SHIFTS, department: DEPARTMENT, assignments });
    const last = result.weeks.at(-1).validation.issues.filter((i) => i.code === ISSUE_CODES.INTERJORNADA);
    expect(last).toHaveLength(1);
    expect(result.summary.red).toBeGreaterThanOrEqual(1);
  });

  it('resumo soma vermelhos e amarelos e define o status', () => {
    const employees = team(2);
    const result = validateMonth({ monthKey: '2026-12', employees, shifts: SHIFTS, department: DEPARTMENT, assignments: [] });
    const red = result.weeks.reduce((sum, w) => sum + w.validation.summary.red, 0);
    const yellow = result.weeks.reduce((sum, w) => sum + w.validation.summary.yellow, 0);
    expect(result.summary).toEqual({
      red,
      yellow,
      total: red + yellow,
      status: red > 0 ? 'RED' : yellow > 0 ? 'YELLOW' : 'GREEN',
    });
  });
});
