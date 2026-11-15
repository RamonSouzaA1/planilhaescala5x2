import { describe, it, expect } from 'vitest';
import { generateSchedule, getTrailingWorkStreak } from './scheduleGenerator.js';
import { ISSUE_CODES } from './cltValidator.js';
import { getWeekDates, addDays } from './dateUtils.js';
import { isSundayOffWeek, assignSundayGroups } from './sundayRotation.js';

const WEEK = '2026-11-16'; // segunda-feira
const DATES = getWeekDates(WEEK);
const PREV_DATES = getWeekDates(addDays(WEEK, -7));
const OFF_GROUP = [1, 2, 3].find((g) => isSundayOffWeek(g, '1_IN_3', WEEK));
const WORK_GROUP = [1, 2, 3].find((g) => g !== OFF_GROUP);

const SHIFTS = [
  { id: 'T1', code: 'T1', name: 'Abertura', startTime: '07:00', endTime: '16:24', breakDurationMinutes: 60 },
  { id: 'T2', code: 'T2', name: 'Intermediário', startTime: '10:00', endTime: '19:24', breakDurationMinutes: 60 },
  { id: 'T3', code: 'T3', name: 'Fechamento', startTime: '12:36', endTime: '22:00', breakDurationMinutes: 60 },
];

const DEPARTMENT = { defaultSundayRule: '1_IN_3', weeklyHoursTarget: 42 };

function team(n, extra = () => ({})) {
  const employees = Array.from({ length: n }, (_, i) => ({
    id: `e${i}`,
    name: `Pessoa ${i}`,
    tags: [],
    status: 'ACTIVE',
    ...extra(i),
  }));
  const groups = assignSundayGroups(employees);
  return employees.map((e) => ({ sundayGroup: groups[e.id], ...e }));
}

function prevWeek(employeeId, cells) {
  return cells.map((cell, i) => ({
    id: `${employeeId}-${PREV_DATES[i]}`,
    employeeId,
    date: PREV_DATES[i],
    type: cell === 'O' ? 'OFF' : 'WORK',
    shiftId: cell === 'O' ? undefined : cell,
    isPinned: false,
  }));
}

function gen(overrides) {
  return generateSchedule({
    weekStartDate: WEEK,
    shifts: SHIFTS,
    department: DEPARTMENT,
    ...overrides,
  });
}

const cellsOf = (result, employeeId) =>
  DATES.map((date) => result.assignments.find((a) => a.employeeId === employeeId && a.date === date));
const typesOf = (result, employeeId) => cellsOf(result, employeeId).map((a) => a.type);
const redIssues = (result) => result.validation.issues.filter((i) => i.severity === 'RED');
const offsOn = (result, date) => result.assignments.filter((a) => a.date === date && a.type === 'OFF').length;

describe('generateSchedule — equipe de 26 (loja exemplo)', () => {
  const employees = team(26);
  const result = gen({ employees });

  it('gera 7 células para cada colaborador ativo', () => {
    expect(result.assignments).toHaveLength(26 * 7);
    for (const a of result.assignments) {
      expect(a.dayOfWeek).toBeDefined();
      expect(a.id).toBe(`${a.employeeId}_${a.date}`);
    }
  });

  it('todos com exatamente 5 dias de trabalho e 2 folgas', () => {
    for (const e of employees) {
      const types = typesOf(result, e.id);
      expect(types.filter((t) => t === 'WORK')).toHaveLength(5);
      expect(types.filter((t) => t === 'OFF')).toHaveLength(2);
    }
  });

  it('nenhuma infração vermelha e rodízio de domingo respeitado', () => {
    expect(redIssues(result)).toEqual([]);
    expect(result.validation.issues.map((i) => i.code)).not.toContain(ISSUE_CODES.SUNDAY_ROTATION);
    for (const e of employees) {
      const sunday = typesOf(result, e.id)[6];
      expect(sunday).toBe(e.sundayGroup === OFF_GROUP ? 'OFF' : 'WORK');
    }
  });

  it('concentra folgas entre segunda e quarta e maximiza sexta a sábado', () => {
    const offs = DATES.map((d) => offsOn(result, d));
    const monToWed = offs[0] + offs[1] + offs[2];
    const thuToSat = offs[3] + offs[4] + offs[5];
    expect(monToWed).toBeGreaterThan(thuToSat);
    expect(offs[5]).toBeLessThanOrEqual(offs[0]);
    expect(offs[4]).toBeLessThanOrEqual(offs[0]);
  });

  it('é determinístico', () => {
    expect(gen({ employees }).assignments).toEqual(result.assignments);
  });
});

describe('virada de semana (OJ 410 e interjornada)', () => {
  it('6 dias seguidos no fim da semana anterior obrigam folga na segunda', () => {
    const employees = team(1, () => ({ sundayGroup: WORK_GROUP }));
    const result = gen({
      employees,
      previousAssignments: prevWeek('e0', ['O', 'T1', 'T1', 'T1', 'T1', 'T1', 'T1']),
    });
    expect(typesOf(result, 'e0')[0]).toBe('OFF');
    expect(result.validation.issues.map((i) => i.code)).not.toContain(ISSUE_CODES.CONSECUTIVE_DAYS);
  });

  it('5 dias seguidos obrigam folga até terça', () => {
    const employees = team(1, () => ({ sundayGroup: WORK_GROUP }));
    const result = gen({
      employees,
      previousAssignments: prevWeek('e0', ['O', 'O', 'T1', 'T1', 'T1', 'T1', 'T1']),
    });
    const types = typesOf(result, 'e0');
    expect(types[0] === 'OFF' || types[1] === 'OFF').toBe(true);
    expect(redIssues(result)).toEqual([]);
  });

  it('getTrailingWorkStreak conta os dias trabalhados no fim da semana anterior', () => {
    const prev = prevWeek('e0', ['T1', 'O', 'T1', 'T1', 'O', 'T1', 'T1']);
    expect(getTrailingWorkStreak(prev, 'e0', WEEK)).toBe(2);
    expect(getTrailingWorkStreak([], 'e0', WEEK)).toBe(0);
  });

  it('mantém o turno da semana anterior e não viola as 11h na segunda', () => {
    const employees = team(1, () => ({ sundayGroup: WORK_GROUP }));
    const result = gen({
      employees,
      previousAssignments: prevWeek('e0', ['O', 'O', 'T3', 'T3', 'T3', 'T3', 'T3']),
    });
    const work = cellsOf(result, 'e0').filter((a) => a.type === 'WORK');
    expect(new Set(work.map((a) => a.shiftId))).toEqual(new Set(['T3']));
    expect(result.validation.issues.map((i) => i.code)).not.toContain(ISSUE_CODES.INTERJORNADA);
  });

  it('ajusta o turno da véspera de uma célula travada para manter 11h', () => {
    const employees = team(1, () => ({ sundayGroup: WORK_GROUP }));
    const result = gen({
      employees,
      previousAssignments: prevWeek('e0', ['O', 'O', 'O', 'T3', 'T3', 'T3', 'T3']),
      existingAssignments: [
        { id: 'p', employeeId: 'e0', date: DATES[3], type: 'WORK', shiftId: 'T1', isPinned: true },
      ],
    });
    expect(result.validation.issues.map((i) => i.code)).not.toContain(ISSUE_CODES.INTERJORNADA);
    expect(cellsOf(result, 'e0')[3].shiftId).toBe('T1');
  });

  it('respeita 35h de descanso quando há folga antes de uma abertura travada', () => {
    const employees = team(1, () => ({ sundayGroup: WORK_GROUP }));
    const result = gen({
      employees,
      previousAssignments: prevWeek('e0', ['O', 'O', 'O', 'T3', 'T3', 'T3', 'T3']),
      existingAssignments: [
        { id: 'p1', employeeId: 'e0', date: DATES[1], type: 'OFF', isPinned: true },
        { id: 'p2', employeeId: 'e0', date: DATES[2], type: 'WORK', shiftId: 'T1', isPinned: true },
      ],
    });
    const codes = result.validation.issues.map((i) => i.code);
    expect(codes).not.toContain(ISSUE_CODES.WEEKLY_REST);
    expect(codes).not.toContain(ISSUE_CODES.INTERJORNADA);
    expect(cellsOf(result, 'e0')[0].shiftId).not.toBe('T3');
  });

  it('rejeita semana que não começa na segunda', () => {
    expect(() => gen({ employees: team(2), weekStartDate: '2026-11-17' })).toThrow(/segunda-feira/);
  });

  it('aplica o deslocamento do ciclo de domingo do setor', () => {
    const employees = team(6);
    const result = gen({ employees, department: { ...DEPARTMENT, sundayCycleOffset: 1 } });
    const offGroup = [1, 2, 3].find((g) => isSundayOffWeek(g, '1_IN_3', WEEK, 1));
    for (const e of employees) {
      expect(typesOf(result, e.id)[6]).toBe(e.sundayGroup === offGroup ? 'OFF' : 'WORK');
    }
    expect(result.validation.issues.map((i) => i.code)).not.toContain(ISSUE_CODES.SUNDAY_ROTATION);
  });
});

describe('travas, ausências e restrições', () => {
  it('células travadas nunca são sobrescritas', () => {
    const employees = team(4);
    const existingAssignments = [
      { id: 'x1', employeeId: 'e0', date: DATES[0], type: 'WORK', shiftId: 'T3', isPinned: true },
      { id: 'x2', employeeId: 'e0', date: DATES[4], type: 'OFF', isPinned: true },
      { id: 'x3', employeeId: 'e1', date: DATES[1], type: 'WORK', shiftId: 'T1', isPinned: false },
    ];
    const result = gen({ employees, existingAssignments });
    const e0 = cellsOf(result, 'e0');
    expect(e0[0]).toMatchObject({ type: 'WORK', shiftId: 'T3', isPinned: true });
    expect(e0[4]).toMatchObject({ type: 'OFF', isPinned: true });
    expect(e0.filter((a) => a.type === 'OFF')).toHaveLength(2);
  });

  it('férias e atestados viram ABSENCE e não são escalados', () => {
    const employees = team(3);
    const absences = [{ id: 'a', employeeId: 'e1', type: 'MEDICAL', startDate: DATES[2], endDate: DATES[3] }];
    const result = gen({ employees, absences });
    const types = typesOf(result, 'e1');
    expect(types[2]).toBe('ABSENCE');
    expect(types[3]).toBe('ABSENCE');
    expect(types.filter((t) => t === 'WORK')).toHaveLength(3); // atestado ocupa dias de trabalho
    expect(types.filter((t) => t === 'OFF')).toHaveLength(2);
    expect(redIssues(result)).toEqual([]);
  });

  it('colaborador com status de férias fica com a semana inteira de ausência', () => {
    const employees = team(3, (i) => (i === 0 ? { status: 'VACATION' } : {}));
    const result = gen({ employees });
    expect(typesOf(result, 'e0')).toEqual(Array(7).fill('ABSENCE'));
    expect(redIssues(result)).toEqual([]);
  });

  it('respeita dias e turnos indisponíveis', () => {
    const employees = team(5, (i) =>
      i === 0 ? { fixedConstraints: { unavailableDays: ['TER', 'QUI'], unavailableShiftIds: ['T3'] } } : {},
    );
    const result = gen({ employees });
    const cells = cellsOf(result, 'e0');
    expect(cells[1].type).toBe('OFF');
    expect(cells[3].type).toBe('OFF');
    expect(cells.filter((a) => a.type === 'WORK').every((a) => a.shiftId !== 'T3')).toBe(true);
  });

  it('ignora colaboradores inativos', () => {
    const employees = team(3, (i) => (i === 2 ? { status: 'INACTIVE' } : {}));
    const result = gen({ employees });
    expect(result.assignments.some((a) => a.employeeId === 'e2')).toBe(false);
  });
});

describe('cobertura e tags', () => {
  it('desloca folgas para cumprir a meta mínima do dia', () => {
    const employees = team(10);
    const coverageRules = ['SEG', 'TER', 'QUA'].map((dayOfWeek, i) => ({
      id: `c${i}`,
      dayOfWeek,
      minTotalStaff: 9,
      requiredTags: [],
    }));
    const result = gen({ employees, coverageRules });
    expect(result.validation.issues.map((i) => i.code)).not.toContain(ISSUE_CODES.COVERAGE_GAP);
    expect(redIssues(result)).toEqual([]);
  });

  it('garante a tag obrigatória todos os dias e espalha líderes entre os turnos', () => {
    const employees = team(12, (i) => (i < 3 ? { tags: ['Líder'] } : {}));
    const coverageRules = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'].map((dayOfWeek, i) => ({
      id: `c${i}`,
      dayOfWeek,
      minTotalStaff: 0,
      requiredTags: [{ tag: 'Líder', minCount: 1 }],
    }));
    const result = gen({ employees, coverageRules });
    expect(result.validation.issues.map((i) => i.code)).not.toContain(ISSUE_CODES.MISSING_TAG);
    const leaderShifts = ['e0', 'e1', 'e2'].map((id) => cellsOf(result, id).find((a) => a.type === 'WORK').shiftId);
    expect(new Set(leaderShifts).size).toBe(3);
  });

  it('dias de pico (feriados) recebem menos folgas', () => {
    const employees = team(15);
    const result = gen({ employees, peakDates: [DATES[2]] });
    expect(offsOn(result, DATES[2])).toBeLessThan(offsOn(result, DATES[0]));
  });
});

describe('casos de borda', () => {
  it.each([1, 3])('N = %i gera escala sem infrações vermelhas', (n) => {
    const result = gen({ employees: team(n) });
    expect(result.assignments).toHaveLength(n * 7);
    expect(redIssues(result)).toEqual([]);
  });

  it('equipe vazia', () => {
    const result = gen({ employees: [] });
    expect(result.assignments).toEqual([]);
    expect(result.validation.status).toBe('GREEN');
  });

  it('sem turnos cadastrados gera só trabalho/folga', () => {
    const result = gen({ employees: team(4), shifts: [] });
    expect(result.assignments.filter((a) => a.type === 'WORK').every((a) => a.shiftId === undefined)).toBe(true);
    expect(redIssues(result)).toEqual([]);
  });

  it('propaga o scheduleCycleId', () => {
    const result = gen({ employees: team(2), scheduleCycleId: 'cyc1' });
    expect(result.assignments.every((a) => a.scheduleCycleId === 'cyc1')).toBe(true);
  });

  it('N = 200 em menos de 1s, sem infrações vermelhas', () => {
    const employees = team(200, (i) => (i % 20 === 0 ? { tags: ['Líder'] } : {}));
    const start = performance.now();
    const result = gen({ employees });
    expect(performance.now() - start).toBeLessThan(1000);
    expect(redIssues(result)).toEqual([]);
  });
});
