import { describe, it, expect } from 'vitest';
import {
  validateSchedule,
  computeHourlyCoverage,
  getCellIssues,
  getLegalWeeklyCap,
  getLegalWeeklyCapHours,
  SEVERITY,
  ISSUE_CODES,
} from './cltValidator.js';
import { getWeekDates, addDays } from './dateUtils.js';
import { isSundayOffWeek } from './sundayRotation.js';

const WEEK = '2026-11-16'; // segunda-feira
const DATES = getWeekDates(WEEK);
const PREV_DATES = getWeekDates(addDays(WEEK, -7));
const NEXT_DATES = getWeekDates(addDays(WEEK, 7));

const SHIFTS = [
  { id: 'T1', code: 'T1', name: 'Abertura', startTime: '07:00', endTime: '16:24', breakDurationMinutes: 60 },
  { id: 'T2', code: 'T2', name: 'Intermediário', startTime: '10:00', endTime: '19:24', breakDurationMinutes: 60 },
  { id: 'T3', code: 'T3', name: 'Fechamento', startTime: '12:36', endTime: '22:00', breakDurationMinutes: 60 },
  { id: 'N', code: 'N', name: 'Noturno', startTime: '22:00', endTime: '06:00', breakDurationMinutes: 60, isNightShift: true },
  { id: 'LONG', code: 'TL', name: 'Longo', startTime: '07:00', endTime: '17:00', breakDurationMinutes: 60 },
  { id: 'E1', code: 'E1', name: 'Abertura cedo', startTime: '06:24', endTime: '15:48', breakDurationMinutes: 60 },
  { id: 'E0', code: 'E0', name: 'Abertura 06:23', startTime: '06:23', endTime: '15:47', breakDurationMinutes: 60 },
  { id: 'NOBREAK', code: 'NB', name: 'Sem intervalo', startTime: '07:00', endTime: '15:00', breakDurationMinutes: 0 },
  { id: 'HALF', code: 'HF', name: 'Meio turno', startTime: '07:00', endTime: '11:30', breakDurationMinutes: 0 },
  { id: 'BREAK30', code: 'B30', name: 'Intervalo 30', startTime: '07:00', endTime: '15:00', breakDurationMinutes: 30 },
  { id: 'X12', code: 'X12', name: 'Doze horas', startTime: '07:00', endTime: '20:00', breakDurationMinutes: 60 },
  { id: 'SIX', code: 'S6', name: 'Seis horas', startTime: '07:00', endTime: '14:00', breakDurationMinutes: 60 },
  { id: 'NIGHT9', code: 'N9', name: 'Noturno 21h', startTime: '21:00', endTime: '06:00', breakDurationMinutes: 60 },
  { id: 'F5', code: 'F5', name: 'Madrugada', startTime: '05:00', endTime: '14:24', breakDurationMinutes: 60 },
  { id: 'A', code: 'A', name: 'Manhã', startTime: '07:00', endTime: '12:30', breakDurationMinutes: 15 },
  { id: 'B', code: 'B', name: 'Tarde', startTime: '13:00', endTime: '18:30', breakDurationMinutes: 15 },
  { id: 'LONGBREAK', code: 'LB', name: 'Intervalo de 3h', startTime: '07:00', endTime: '18:00', breakDurationMinutes: 180 },
  { id: 'BREAK120', code: 'B120', name: 'Intervalo de 2h', startTime: '07:00', endTime: '17:00', breakDurationMinutes: 120 },
  { id: 'SPLIT', code: 'SP', name: 'Dividido', startTime: '06:00', endTime: '18:30', breakDurationMinutes: 120 },
  { id: 'P12', code: 'P12', name: 'Presença 12h', startTime: '06:00', endTime: '18:00', breakDurationMinutes: 120 },
];

/** Monta as atribuições de uma semana. Cada item: id de turno, 'O' (folga) ou 'A' (ausência). */
function week(employeeId, cells, dates = DATES) {
  return cells.map((cell, i) => ({
    id: `${employeeId}-${dates[i]}`,
    employeeId,
    date: dates[i],
    type: cell === 'O' ? 'OFF' : cell === 'A' ? 'ABSENCE' : 'WORK',
    shiftId: cell === 'O' || cell === 'A' ? undefined : cell,
    isPinned: false,
  }));
}

function emp(id, extra = {}) {
  return { id, name: id, tags: [], sundayGroup: 1, status: 'ACTIVE', ...extra };
}

/** Grupo de domingo que deve folgar na semana WEEK pelo rodízio 1 em 3. */
const OFF_GROUP = [1, 2, 3].find((g) => isSundayOffWeek(g, '1_IN_3', WEEK));
const WORK_GROUP = [1, 2, 3].find((g) => g !== OFF_GROUP);

function run(overrides) {
  return validateSchedule({
    weekStartDate: WEEK,
    shifts: SHIFTS,
    department: { defaultSundayRule: '1_IN_3', weeklyHoursTarget: 42 },
    previousAssignments: [],
    absences: [],
    coverageRules: [],
    ...overrides,
  });
}

const codes = (result) => result.issues.map((i) => i.code);

describe('validateSchedule — semana válida', () => {
  it('5x2 com turno de 8h24 (42h) não gera alertas', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      assignments: week('ana', ['T1', 'O', 'T1', 'T1', 'T1', 'T1', 'O']),
    });
    expect(result.issues).toEqual([]);
    expect(result.status).toBe('GREEN');
    expect(result.summary).toEqual({ red: 0, yellow: 0, total: 0 });
  });

  it('ignora funcionários inativos', () => {
    const result = run({
      employees: [emp('ana', { status: 'INACTIVE' })],
      assignments: week('ana', ['T1', 'T1', 'T1', 'T1', 'T1', 'T1', 'T1']),
    });
    expect(result.issues).toEqual([]);
  });
});

describe('modelo 5x2 (folgas na semana)', () => {
  it('3 folgas é infração vermelha', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      assignments: week('ana', ['T1', 'O', 'O', 'T1', 'T1', 'T1', 'O']),
    });
    expect(codes(result)).toContain(ISSUE_CODES.WEEKLY_OFF_COUNT);
    expect(result.status).toBe('RED');
  });

  it('1 folga é infração vermelha', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      assignments: week('ana', ['T1', 'T1', 'T1', 'T1', 'T1', 'T1', 'O']),
    });
    const issue = result.issues.find((i) => i.code === ISSUE_CODES.WEEKLY_OFF_COUNT);
    expect(issue.severity).toBe(SEVERITY.RED);
    expect(issue.employeeId).toBe('ana');
  });

  it('dia sem atribuição conta como folga', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      assignments: week('ana', ['T1', 'O', 'T1', 'T1', 'T1', 'T1', 'O']).filter((a) => a.date !== DATES[2]),
    });
    expect(codes(result)).toContain(ISSUE_CODES.WEEKLY_OFF_COUNT);
  });

  it('semana inteira de férias não gera alerta de folgas', () => {
    const result = run({
      employees: [emp('ana')],
      assignments: week('ana', ['A', 'A', 'A', 'A', 'A', 'A', 'A']),
    });
    expect(codes(result)).not.toContain(ISSUE_CODES.WEEKLY_OFF_COUNT);
  });

  it('com ausência na semana, mais de 5 dias de trabalho continua vermelho', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: WORK_GROUP })],
      assignments: week('ana', ['A', 'T1', 'T1', 'T1', 'T1', 'T1', 'T1']),
    });
    expect(codes(result)).toContain(ISSUE_CODES.WEEKLY_OFF_COUNT);
  });
});

describe('interjornada (11h)', () => {
  it('fechamento 22:00 seguido de abertura 07:00 (9h) é vermelho no dia seguinte', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      assignments: week('ana', ['T3', 'T1', 'O', 'T1', 'T1', 'T1', 'O']),
    });
    const issue = result.issues.find((i) => i.code === ISSUE_CODES.INTERJORNADA);
    expect(issue).toBeDefined();
    expect(issue.severity).toBe(SEVERITY.RED);
    expect(issue.date).toBe(DATES[1]);
    expect(issue.details.restMinutes).toBe(9 * 60);
  });

  it('exatamente 11h é permitido; 10h59 é vermelho', () => {
    const ok = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      assignments: week('ana', ['T2', 'E1', 'O', 'E1', 'E1', 'E1', 'O']), // 19:24 → 06:24
    });
    expect(codes(ok)).not.toContain(ISSUE_CODES.INTERJORNADA);
    const bad = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      assignments: week('ana', ['T2', 'E0', 'O', 'E0', 'E0', 'E0', 'O']), // 19:24 → 06:23
    });
    expect(bad.issues.find((i) => i.code === ISSUE_CODES.INTERJORNADA)?.details.restMinutes).toBe(659);
  });

  it('noturno no domingo anterior seguido de abertura na segunda', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      previousAssignments: week('ana', ['O', 'O', 'N', 'N', 'N', 'N', 'N'], PREV_DATES),
      assignments: week('ana', ['T1', 'O', 'T1', 'T1', 'T1', 'T1', 'O']),
    });
    const issue = result.issues.find((i) => i.code === ISSUE_CODES.INTERJORNADA);
    expect(issue?.date).toBe(DATES[0]);
    expect(issue?.details.restMinutes).toBe(60);
  });

  it('turnos sobrepostos geram mensagem de sobreposição, sem descanso negativo no texto', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      assignments: week('ana', ['N', 'F5', 'O', 'F5', 'F5', 'F5', 'O']), // sai 06:00, entra 05:00
    });
    const issue = result.issues.find((i) => i.code === ISSUE_CODES.INTERJORNADA);
    expect(issue?.details.restMinutes).toBe(-60);
    expect(issue?.message).toMatch(/começa antes do fim/);
  });

  it('intermediário 19:24 seguido de abertura 07:00 (11h36) é permitido', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      assignments: week('ana', ['T2', 'T1', 'O', 'T1', 'T1', 'T1', 'O']),
    });
    expect(codes(result)).not.toContain(ISSUE_CODES.INTERJORNADA);
  });

  it('considera o último turno da semana anterior', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      previousAssignments: week('ana', ['O', 'O', 'T3', 'T3', 'T3', 'T3', 'T3'], PREV_DATES),
      assignments: week('ana', ['T1', 'O', 'T1', 'T1', 'T1', 'T1', 'O']),
    });
    const issue = result.issues.find((i) => i.code === ISSUE_CODES.INTERJORNADA);
    expect(issue?.date).toBe(DATES[0]);
  });

  it('turno noturno que vira o dia é calculado corretamente', () => {
    const ok = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      assignments: week('ana', ['N', 'N', 'O', 'N', 'N', 'N', 'O']),
    });
    expect(codes(ok)).not.toContain(ISSUE_CODES.INTERJORNADA); // 06:00 → 22:00 = 16h

    const bad = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      assignments: week('ana', ['N', 'T1', 'O', 'T1', 'T1', 'T1', 'O']),
    });
    const issue = bad.issues.find((i) => i.code === ISSUE_CODES.INTERJORNADA);
    expect(issue?.details.restMinutes).toBe(60); // sai 06:00, entra 07:00
  });
});

describe('dias consecutivos (OJ 410 SDI-1)', () => {
  it('7º dia seguido na virada de semana é vermelho', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      previousAssignments: week('ana', ['O', 'O', 'T1', 'T1', 'T1', 'T1', 'T1'], PREV_DATES),
      assignments: week('ana', ['T1', 'T1', 'O', 'O', 'T1', 'T1', 'T1']),
    });
    const issue = result.issues.find((i) => i.code === ISSUE_CODES.CONSECUTIVE_DAYS);
    expect(issue?.severity).toBe(SEVERITY.RED);
    expect(issue?.date).toBe(DATES[1]);
    expect(issue?.details.consecutiveDays).toBe(7);
  });

  it('6 dias seguidos na virada é permitido', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      previousAssignments: week('ana', ['O', 'O', 'O', 'T1', 'T1', 'T1', 'T1'], PREV_DATES),
      assignments: week('ana', ['T1', 'T1', 'O', 'O', 'T1', 'T1', 'T1']),
    });
    expect(codes(result)).not.toContain(ISSUE_CODES.CONSECUTIVE_DAYS);
  });

  it('sequência já estourada na semana anterior é apontada na segunda', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      previousAssignments: week('ana', ['T1', 'T1', 'T1', 'T1', 'T1', 'T1', 'T1'], PREV_DATES),
      assignments: week('ana', ['T1', 'O', 'T1', 'T1', 'T1', 'T1', 'O']),
    });
    const issue = result.issues.find((i) => i.code === ISSUE_CODES.CONSECUTIVE_DAYS);
    expect(issue?.date).toBe(DATES[0]);
    expect(issue?.details.consecutiveDays).toBe(8);
  });

  it('reporta uma vez por sequência', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: WORK_GROUP })],
      assignments: week('ana', ['T1', 'T1', 'T1', 'T1', 'T1', 'T1', 'T1']),
      previousAssignments: week('ana', ['O', 'O', 'O', 'O', 'O', 'T1', 'T1'], PREV_DATES),
    });
    expect(codes(result).filter((c) => c === ISSUE_CODES.CONSECUTIVE_DAYS)).toHaveLength(1);
  });
});

describe('virada para a semana seguinte já gravada', () => {
  // Reprodução da revisão F10: W fecha com T3 no domingo e W+1 abre com T1 na segunda.
  const current = () => week('ana', ['O', 'O', 'T3', 'T3', 'T3', 'T3', 'T3']);
  const following = () => week('ana', ['T1', 'T1', 'O', 'O', 'T1', 'T1', 'T1'], NEXT_DATES);

  it('sem a semana seguinte, W não tem infração vermelha', () => {
    const result = run({ employees: [emp('ana', { sundayGroup: WORK_GROUP })], assignments: current() });
    expect(result.summary.red).toBe(0);
  });

  it('com a semana seguinte, interjornada de 9h e 7º dia seguido aparecem no domingo de W', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: WORK_GROUP })],
      assignments: current(),
      nextAssignments: following(),
    });
    expect(result.status).toBe('RED');

    const rest = result.issues.find((i) => i.code === ISSUE_CODES.INTERJORNADA);
    expect(rest).toMatchObject({ severity: SEVERITY.RED, employeeId: 'ana', date: DATES[6] });
    expect(rest.details).toMatchObject({ restMinutes: 9 * 60, previousDate: DATES[6], nextWeekDate: NEXT_DATES[0] });
    expect(rest.message).toMatch(/semana seguinte/);

    const streak = result.issues.find((i) => i.code === ISSUE_CODES.CONSECUTIVE_DAYS);
    expect(streak).toMatchObject({ severity: SEVERITY.RED, date: DATES[6] });
    expect(streak.details).toMatchObject({ consecutiveDays: 7, nextWeekDate: NEXT_DATES[1] });

    expect(getCellIssues(result, 'ana', DATES[6]).map((i) => i.code).sort()).toEqual(
      [ISSUE_CODES.CONSECUTIVE_DAYS, ISSUE_CODES.INTERJORNADA].sort(),
    );
    // Nada é apontado em datas fora da semana validada.
    expect(result.issues.every((i) => i.date === null || DATES.includes(i.date))).toBe(true);
  });

  it('é simétrico com a validação de W+1 usando W como semana anterior', () => {
    const next = validateSchedule({
      weekStartDate: NEXT_DATES[0],
      shifts: SHIFTS,
      department: { defaultSundayRule: 'CUSTOM', weeklyHoursTarget: 42 },
      employees: [emp('ana', { sundayGroup: WORK_GROUP })],
      previousAssignments: current(),
      assignments: following(),
    });
    expect(next.issues.find((i) => i.code === ISSUE_CODES.INTERJORNADA)?.date).toBe(NEXT_DATES[0]);
    expect(next.issues.find((i) => i.code === ISSUE_CODES.CONSECUTIVE_DAYS)?.date).toBe(NEXT_DATES[1]);
  });

  it('descanso de 35h com folga na segunda de W+1 é verificado', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: WORK_GROUP })],
      assignments: week('ana', ['T1', 'T1', 'O', 'O', 'T1', 'T1', 'T3']),
      nextAssignments: week('ana', ['O', 'T1', 'T1', 'T1', 'T1', 'O', 'O'], NEXT_DATES),
    });
    const issue = result.issues.find((i) => i.code === ISSUE_CODES.WEEKLY_REST);
    expect(issue).toMatchObject({ severity: SEVERITY.RED, date: DATES[6] });
    expect(issue.details).toMatchObject({ restMinutes: 33 * 60, requiredMinutes: 35 * 60, nextWeekDate: NEXT_DATES[1] });
  });

  it('semana seguinte compatível não gera alertas', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: WORK_GROUP })],
      assignments: current(),
      nextAssignments: week('ana', ['T3', 'O', 'O', 'T3', 'T3', 'T3', 'T3'], NEXT_DATES),
    });
    expect(result.issues).toEqual([]);
  });

  it('ignora datas que não são da semana seguinte e colaboradores inativos', () => {
    const later = getWeekDates(addDays(WEEK, 14));
    const result = run({
      employees: [emp('ana', { sundayGroup: WORK_GROUP }), emp('bia', { status: 'INACTIVE' })],
      assignments: [...current(), ...week('bia', ['O', 'O', 'T3', 'T3', 'T3', 'T3', 'T3'])],
      nextAssignments: [...week('ana', ['T1', 'T1', 'T1', 'T1', 'T1', 'T1', 'T1'], later), ...week('bia', ['T1', 'T1', 'T1', 'T1', 'T1', 'T1', 'T1'], NEXT_DATES)],
    });
    expect(result.issues).toEqual([]);
  });
});

describe('ausências', () => {
  it('escalar colaborador em atestado é vermelho', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      absences: [{ id: 'a1', employeeId: 'ana', type: 'MEDICAL', startDate: DATES[2], endDate: DATES[3] }],
      assignments: week('ana', ['T1', 'O', 'T1', 'T1', 'T1', 'T1', 'O']),
    });
    const conflicts = result.issues.filter((i) => i.code === ISSUE_CODES.ABSENCE_CONFLICT);
    expect(conflicts.map((i) => i.date)).toEqual([DATES[2], DATES[3]]);
    expect(conflicts[0].severity).toBe(SEVERITY.RED);
  });

  it('aceita datas ISO com horário vindas da API', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      absences: [
        {
          id: 'a1',
          employeeId: 'ana',
          type: 'MEDICAL',
          startDate: `${DATES[2]}T00:00:00.000Z`,
          endDate: `${DATES[3]}T00:00:00.000Z`,
        },
      ],
      assignments: week('ana', ['T1', 'O', 'T1', 'T1', 'T1', 'T1', 'O']),
    });
    const conflicts = result.issues.filter((i) => i.code === ISSUE_CODES.ABSENCE_CONFLICT);
    expect(conflicts.map((i) => i.date)).toEqual([DATES[2], DATES[3]]);
  });

  it('atestado de 1 dia ocupa um dia de trabalho: 5 trabalhos + 1 folga é vermelho', () => {
    const bad = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      assignments: week('ana', ['A', 'T1', 'T1', 'T1', 'T1', 'T1', 'O']),
    });
    expect(codes(bad)).toContain(ISSUE_CODES.WEEKLY_OFF_COUNT);
    const ok = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      assignments: week('ana', ['A', 'O', 'T1', 'T1', 'T1', 'T1', 'O']),
    });
    expect(codes(ok)).not.toContain(ISSUE_CODES.WEEKLY_OFF_COUNT);
  });

  it('em semana com férias, basta não passar de 5 dias de trabalho', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: WORK_GROUP })],
      absences: [{ id: 'v', employeeId: 'ana', type: 'VACATION', startDate: DATES[0], endDate: DATES[2] }],
      assignments: week('ana', ['A', 'A', 'A', 'T1', 'T1', 'T1', 'T1']),
    });
    expect(codes(result)).not.toContain(ISSUE_CODES.WEEKLY_OFF_COUNT);
  });

  it('status de férias sem calendário cadastrado não gera alerta de folgas', () => {
    const result = run({ employees: [emp('ana', { status: 'VACATION' })], assignments: [] });
    expect(result.issues).toEqual([]);
  });

  it('célula ABSENCE e registro no mesmo dia contam uma vez só', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      absences: [{ id: 'a', employeeId: 'ana', type: 'MEDICAL', startDate: DATES[0], endDate: DATES[0] }],
      assignments: week('ana', ['A', 'O', 'T1', 'T1', 'T1', 'T1', 'O']),
    });
    expect(codes(result)).not.toContain(ISSUE_CODES.WEEKLY_OFF_COUNT);
  });

  it('mensagem de folgas nunca mostra número negativo', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: WORK_GROUP })],
      absences: [{ id: 'a', employeeId: 'ana', type: 'MEDICAL', startDate: DATES[0], endDate: DATES[1] }],
      assignments: week('ana', ['T1', 'T1', 'T1', 'T1', 'T1', 'T1', 'T1']),
    });
    const issue = result.issues.find((i) => i.code === ISSUE_CODES.WEEKLY_OFF_COUNT);
    expect(issue.message).not.toMatch(/-\d/);
  });
});

describe('intrajornada e jornada diária', () => {
  it('8h sem intervalo é vermelho (art. 71)', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      assignments: week('ana', ['NOBREAK', 'O', 'T1', 'T1', 'T1', 'T1', 'O']),
    });
    const issue = result.issues.find((i) => i.code === ISSUE_CODES.INTRAJORNADA);
    expect(issue?.date).toBe(DATES[0]);
    expect(issue?.details.requiredBreakMinutes).toBe(60);
  });

  it('4h30 sem intervalo exige 15 min', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      assignments: week('ana', ['HALF', 'O', 'T1', 'T1', 'T1', 'T1', 'O']),
    });
    expect(result.issues.find((i) => i.code === ISSUE_CODES.INTRAJORNADA)?.details.requiredBreakMinutes).toBe(15);
  });

  it('convenção com intervalo reduzido para 30 min é respeitada', () => {
    const result = run({
      department: { defaultSundayRule: '1_IN_3', weeklyHoursTarget: 42, minBreakMinutes: 30 },
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      assignments: week('ana', ['BREAK30', 'O', 'T1', 'T1', 'T1', 'T1', 'O']),
    });
    expect(codes(result)).not.toContain(ISSUE_CODES.INTRAJORNADA);
  });

  it('intervalo acima de 120 min é vermelho (art. 71)', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      assignments: week('ana', ['LONGBREAK', 'O', 'T1', 'T1', 'T1', 'T1', 'O']),
    });
    const issues = result.issues.filter((i) => i.code === ISSUE_CODES.INTRAJORNADA);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: SEVERITY.RED, date: DATES[0] });
    expect(issues[0].details).toMatchObject({ breakMinutes: 180, maxBreakMinutes: 120 });
    expect(issues[0].message).toMatch(/máximo 120 min/);
    expect(result.status).toBe('RED');
  });

  it('intervalo de exatamente 120 min é permitido', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      assignments: week('ana', ['BREAK120', 'O', 'T1', 'T1', 'T1', 'T1', 'O']),
    });
    expect(codes(result)).not.toContain(ISSUE_CODES.INTRAJORNADA);
  });

  it('presença acima de 12h entre entrada e saída é vermelha; exatamente 12h é permitida', () => {
    const bad = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      assignments: week('ana', ['SPLIT', 'O', 'SIX', 'SIX', 'SIX', 'SIX', 'O']),
    });
    const issue = bad.issues.find((i) => i.code === ISSUE_CODES.INTRAJORNADA);
    expect(issue).toMatchObject({ severity: SEVERITY.RED, date: DATES[0] });
    expect(issue.details).toMatchObject({ presenceMinutes: 12 * 60 + 30, maxPresenceMinutes: 12 * 60 });
    expect(issue.message).toMatch(/12h30 entre entrada e saída/);

    const ok = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      assignments: week('ana', ['P12', 'O', 'SIX', 'SIX', 'SIX', 'SIX', 'O']),
    });
    expect(codes(ok)).not.toContain(ISSUE_CODES.INTRAJORNADA);
  });

  it('turno de 12h é vermelho mesmo com a semana dentro de 42h (art. 59)', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      assignments: week('ana', ['X12', 'O', 'SIX', 'SIX', 'SIX', 'SIX', 'O']),
    });
    const issue = result.issues.find((i) => i.code === ISSUE_CODES.DAILY_HOURS);
    expect(issue?.date).toBe(DATES[0]);
    expect(codes(result)).not.toContain(ISSUE_CODES.WEEKLY_HOURS);
  });
});

describe('descanso semanal de 35h (Súmula 110 TST)', () => {
  it('fechamento, folga isolada e abertura (33h) é vermelho', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      assignments: week('ana', ['T3', 'O', 'T1', 'T1', 'T1', 'T1', 'O']),
    });
    const issue = result.issues.find((i) => i.code === ISSUE_CODES.WEEKLY_REST);
    expect(issue?.severity).toBe(SEVERITY.RED);
    expect(issue?.date).toBe(DATES[2]);
    expect(issue?.details.restMinutes).toBe(33 * 60);
  });

  it('mesmo turno com folga no meio passa de 35h', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      assignments: week('ana', ['T3', 'O', 'T3', 'T3', 'T3', 'T3', 'O']),
    });
    expect(codes(result)).not.toContain(ISSUE_CODES.WEEKLY_REST);
  });
});

describe('carga horária semanal', () => {
  it('5 turnos de 9h (45h) excedem 42h', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      assignments: week('ana', ['LONG', 'O', 'LONG', 'LONG', 'LONG', 'LONG', 'O']),
    });
    const issue = result.issues.find((i) => i.code === ISSUE_CODES.WEEKLY_HOURS);
    expect(issue?.severity).toBe(SEVERITY.RED);
    expect(issue?.details.workedMinutes).toBe(45 * 60);
  });

  it('hora noturna reduzida conta na carga semanal', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      assignments: week('ana', ['NIGHT9', 'O', 'NIGHT9', 'NIGHT9', 'NIGHT9', 'NIGHT9', 'O']),
    });
    const issue = result.issues.find((i) => i.code === ISSUE_CODES.WEEKLY_HOURS);
    // 21:00–06:00 cobre toda a faixa 22h–05h, então 05h–06h também é noturna (Súmula 60, II):
    // 8h de relógio + 480 min noturnos / 7 = 480 + 69 = 549 min por dia, 5 dias = 45h45.
    expect(issue?.details.workedMinutes).toBe(5 * 549);
  });

  it('meta enviada como texto ("40") continua valendo', () => {
    const result = run({
      department: { defaultSundayRule: '1_IN_3', weeklyHoursTarget: '40' },
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      assignments: week('ana', ['T1', 'O', 'T1', 'T1', 'T1', 'T1', 'O']),
    });
    expect(codes(result)).toContain(ISSUE_CODES.WEEKLY_HOURS);
  });

  it('42h excedem a meta de 40h do setor', () => {
    const result = run({
      department: { defaultSundayRule: '1_IN_3', weeklyHoursTarget: 40 },
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      assignments: week('ana', ['T1', 'O', 'T1', 'T1', 'T1', 'T1', 'O']),
    });
    expect(codes(result)).toContain(ISSUE_CODES.WEEKLY_HOURS);
  });
});

describe('rodízio de domingo', () => {
  it('trabalhar no domingo de folga do grupo é amarelo', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      assignments: week('ana', ['T1', 'O', 'O', 'T1', 'T1', 'T1', 'T1']),
    });
    const issue = result.issues.find((i) => i.code === ISSUE_CODES.SUNDAY_ROTATION);
    expect(issue?.severity).toBe(SEVERITY.YELLOW);
    expect(issue?.date).toBe(DATES[6]);
  });

  it('grupo que não folga neste domingo pode trabalhar', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: WORK_GROUP })],
      assignments: week('ana', ['T1', 'O', 'O', 'T1', 'T1', 'T1', 'T1']),
    });
    expect(codes(result)).not.toContain(ISSUE_CODES.SUNDAY_ROTATION);
  });

  it('regra CUSTOM não é verificada', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      department: { defaultSundayRule: 'CUSTOM', weeklyHoursTarget: 42 },
      assignments: week('ana', ['T1', 'O', 'O', 'T1', 'T1', 'T1', 'T1']),
    });
    expect(codes(result)).not.toContain(ISSUE_CODES.SUNDAY_ROTATION);
  });

  it('regra individual 1 em 2 é aplicada dentro da validação', () => {
    const group = [1, 2].find((g) => isSundayOffWeek(g, '1_IN_2', WEEK));
    const result = run({
      employees: [emp('ana', { sundayGroup: group, customSundayRule: '1_IN_2' })],
      assignments: week('ana', ['T1', 'O', 'O', 'T1', 'T1', 'T1', 'T1']),
    });
    expect(codes(result)).toContain(ISSUE_CODES.SUNDAY_ROTATION);
  });

  it('deslocamento do ciclo do setor muda o grupo que folga', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      department: { defaultSundayRule: '1_IN_3', weeklyHoursTarget: 42, sundayCycleOffset: 1 },
      assignments: week('ana', ['T1', 'O', 'O', 'T1', 'T1', 'T1', 'T1']),
    });
    expect(codes(result)).not.toContain(ISSUE_CODES.SUNDAY_ROTATION);
  });
});

describe('cobertura', () => {
  const coverageRules = [
    {
      id: 'c1',
      dayOfWeek: 'SEG',
      minTotalStaff: 3,
      requiredTags: [{ tag: 'Líder', minCount: 1 }],
      peakHours: [{ start: '11:00', end: '14:00', minStaff: 2 }],
    },
  ];

  it('falta de pessoas, de tag e de pico geram alertas amarelos', () => {
    const result = run({
      coverageRules,
      employees: [emp('ana', { sundayGroup: OFF_GROUP }), emp('bia', { sundayGroup: OFF_GROUP })],
      assignments: [
        ...week('ana', ['T1', 'O', 'T1', 'T1', 'T1', 'T1', 'O']),
        ...week('bia', ['T3', 'O', 'T3', 'T3', 'T3', 'T3', 'O']),
      ],
    });
    const monday = result.issues.filter((i) => i.date === DATES[0] && !i.employeeId);
    expect(monday.map((i) => i.code).sort()).toEqual(
      [ISSUE_CODES.COVERAGE_GAP, ISSUE_CODES.MISSING_TAG, ISSUE_CODES.PEAK_COVERAGE].sort(),
    );
    expect(monday.every((i) => i.severity === SEVERITY.YELLOW)).toBe(true);
    expect(result.status).toBe('YELLOW');
  });

  it('cobertura atendida não gera alertas', () => {
    const result = run({
      coverageRules,
      employees: [
        emp('ana', { sundayGroup: OFF_GROUP, tags: ['Líder'] }),
        emp('bia', { sundayGroup: OFF_GROUP }),
        emp('caio', { sundayGroup: OFF_GROUP }),
      ],
      assignments: [
        ...week('ana', ['T1', 'O', 'T1', 'T1', 'T1', 'T1', 'O']),
        ...week('bia', ['T2', 'O', 'T2', 'T2', 'T2', 'T2', 'O']),
        ...week('caio', ['T3', 'O', 'T3', 'T3', 'T3', 'T3', 'O']),
      ],
    });
    expect(result.issues).toEqual([]);
  });

  it('pico que atravessa a meia-noite é verificado até o fim', () => {
    const rules = [{ id: 'n', dayOfWeek: 'SEG', minTotalStaff: 0, peakHours: [{ start: '21:00', end: '02:00', minStaff: 1 }] }];
    const result = run({
      coverageRules: rules,
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      assignments: week('ana', ['T3', 'O', 'T3', 'T3', 'T3', 'T3', 'O']),
    });
    expect(codes(result)).toContain(ISSUE_CODES.PEAK_COVERAGE);
  });

  it('buraco de meia hora dentro do pico é detectado', () => {
    const rules = [{ id: 'p', dayOfWeek: 'SEG', minTotalStaff: 0, peakHours: [{ start: '12:00', end: '14:00', minStaff: 1 }] }];
    const result = run({
      coverageRules: rules,
      employees: [emp('ana', { sundayGroup: OFF_GROUP }), emp('bia', { sundayGroup: OFF_GROUP })],
      assignments: [
        ...week('ana', ['A', 'O', 'O', 'O', 'O', 'O', 'O']).map((a) => (a.date === DATES[0] ? { ...a, type: 'WORK', shiftId: 'A' } : a)),
        ...week('bia', ['B', 'O', 'O', 'O', 'O', 'O', 'O']),
      ],
    });
    const issue = result.issues.find((i) => i.code === ISSUE_CODES.PEAK_COVERAGE);
    expect(issue?.details.actual).toBe(0);
  });

  it('noturno da véspera conta no pico da madrugada', () => {
    const rules = [{ id: 'm', dayOfWeek: 'TER', minTotalStaff: 0, peakHours: [{ start: '02:00', end: '04:00', minStaff: 1 }] }];
    const result = run({
      coverageRules: rules,
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      assignments: week('ana', ['N', 'O', 'N', 'N', 'N', 'N', 'O']),
    });
    expect(codes(result)).not.toContain(ISSUE_CODES.PEAK_COVERAGE);
  });

  it('regras duplicadas do mesmo dia são consolidadas pelo maior mínimo', () => {
    const rules = [
      { id: 'r1', dayOfWeek: 'SEG', minTotalStaff: 1 },
      { id: 'r2', dayOfWeek: 'SEG', minTotalStaff: 5 },
    ];
    const result = run({
      coverageRules: rules,
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      assignments: week('ana', ['T1', 'O', 'T1', 'T1', 'T1', 'T1', 'O']),
    });
    expect(result.issues.find((i) => i.code === ISSUE_CODES.COVERAGE_GAP)?.details.required).toBe(5);
  });
});

describe('entradas inválidas', () => {
  it('semana que não começa na segunda lança erro', () => {
    expect(() => run({ weekStartDate: '2026-11-15', employees: [], assignments: [] })).toThrow(/segunda-feira/);
  });

  it('turno com horário inválido lança erro', () => {
    expect(() =>
      run({ shifts: [{ id: 'X', startTime: '', endTime: '16:00' }], employees: [], assignments: [] }),
    ).toThrow(/Horário inválido/);
  });
});

describe('restrições individuais', () => {
  it('trabalhar em dia ou turno bloqueado é amarelo', () => {
    const result = run({
      employees: [
        emp('carlos', {
          sundayGroup: OFF_GROUP,
          fixedConstraints: { unavailableDays: ['TER'], unavailableShiftIds: ['T3'] },
        }),
      ],
      assignments: week('carlos', ['T1', 'T1', 'O', 'T3', 'T1', 'T1', 'O']),
    });
    const issues = result.issues.filter((i) => i.code === ISSUE_CODES.RESTRICTION);
    expect(issues.map((i) => i.date)).toEqual([DATES[1], DATES[3]]);
    expect(issues[0].severity).toBe(SEVERITY.YELLOW);
  });
});

describe('índices e utilitários', () => {
  it('getCellIssues retorna os alertas de uma célula', () => {
    const result = run({
      employees: [emp('ana', { sundayGroup: OFF_GROUP })],
      assignments: week('ana', ['T3', 'T1', 'O', 'T1', 'T1', 'T1', 'O']),
    });
    expect(getCellIssues(result, 'ana', DATES[1]).map((i) => i.code)).toEqual([ISSUE_CODES.INTERJORNADA]);
    expect(getCellIssues(result, 'ana', DATES[0])).toEqual([]);
  });

  it('computeHourlyCoverage conta quem está na loja a cada hora cheia', () => {
    const assignments = [
      ...week('ana', ['T1', 'O', 'O', 'O', 'O', 'O', 'O']),
      ...week('bia', ['N', 'O', 'O', 'O', 'O', 'O', 'O']),
    ];
    const monday = computeHourlyCoverage({ assignments, shifts: SHIFTS, date: DATES[0] });
    expect(monday).toHaveLength(24);
    expect(monday[6]).toBe(0);
    expect(monday[7]).toBe(1);
    expect(monday[16]).toBe(1);
    expect(monday[17]).toBe(0);
    expect(monday[22]).toBe(1);
    const tuesday = computeHourlyCoverage({ assignments, shifts: SHIFTS, date: DATES[1] });
    expect(tuesday[5]).toBe(1); // noturno de segunda termina 06:00 de terça
    expect(tuesday[6]).toBe(0);
  });

  it('valida 200 funcionários em menos de 500ms', () => {
    const employees = Array.from({ length: 200 }, (_, i) => emp(`e${i}`, { sundayGroup: (i % 3) + 1 }));
    const assignments = employees.flatMap((e) => week(e.id, ['T1', 'O', 'T1', 'T1', 'T1', 'T1', 'O']));
    const start = performance.now();
    run({ employees, assignments });
    expect(performance.now() - start).toBeLessThan(500);
  });
});

describe('teto legal de horas pela data (EC 141/2026)', () => {
  /** 8h48 por dia: 44h em 5 dias. */
  const L44 = { id: 'L44', code: 'L44', name: 'Abertura 44h', startTime: '07:00', endTime: '16:48', breakDurationMinutes: 60 };
  const runOn = (weekStartDate, cells, department) =>
    validateSchedule({
      weekStartDate,
      shifts: [...SHIFTS, L44],
      department,
      employees: [emp('ana')],
      assignments: week('ana', cells, getWeekDates(weekStartDate)),
    });
  const weeklyHoursIssue = (result) => result.issues.find((i) => i.code === ISSUE_CODES.WEEKLY_HOURS);

  it('getLegalWeeklyCapHours: 44h até 14/12/2026, 42h até 14/12/2027 e 40h a partir de 15/12/2027', () => {
    expect(getLegalWeeklyCapHours('2026-11-16')).toBe(44);
    expect(getLegalWeeklyCapHours('2026-12-14')).toBe(44);
    expect(getLegalWeeklyCapHours('2026-12-15')).toBe(42);
    expect(getLegalWeeklyCapHours('2026-12-21')).toBe(42);
    expect(getLegalWeeklyCapHours('2027-12-14')).toBe(42);
    expect(getLegalWeeklyCapHours('2027-12-15')).toBe(40);
    expect(getLegalWeeklyCapHours('2031-01-06')).toBe(40);
    expect(getLegalWeeklyCapHours('2026-12-15T10:00:00.000Z')).toBe(42);
  });

  it('getLegalWeeklyCap informa a vigência da etapa', () => {
    expect(getLegalWeeklyCap('2026-11-16')).toEqual({ hours: 44, from: null, until: '2026-12-14' });
    expect(getLegalWeeklyCap('2027-03-01')).toEqual({ hours: 42, from: '2026-12-15', until: '2027-12-14' });
    expect(getLegalWeeklyCap('2028-01-03')).toEqual({ hours: 40, from: '2027-12-15', until: null });
  });

  it('data inválida lança erro', () => {
    expect(() => getLegalWeeklyCapHours('15/12/2026')).toThrow(/Data inválida/);
    expect(() => getLegalWeeklyCapHours(undefined)).toThrow(/Data inválida/);
  });

  it('semana de 14/12/2026 ainda aceita 44h com meta 44h', () => {
    const result = runOn('2026-12-14', ['L44', 'O', 'L44', 'L44', 'L44', 'L44', 'O'], { defaultSundayRule: 'CUSTOM', weeklyHoursTarget: 44 });
    expect(weeklyHoursIssue(result)).toBeUndefined();
  });

  it('a partir da semana de 21/12/2026 a meta de 44h é limitada a 42h pela lei', () => {
    const result = runOn('2026-12-21', ['L44', 'O', 'L44', 'L44', 'L44', 'L44', 'O'], { defaultSundayRule: 'CUSTOM', weeklyHoursTarget: 44 });
    const issue = weeklyHoursIssue(result);
    expect(issue?.severity).toBe(SEVERITY.RED);
    expect(issue?.details).toMatchObject({ workedMinutes: 44 * 60, targetMinutes: 42 * 60, legalCapMinutes: 42 * 60, limitSource: 'LAW' });
    expect(issue?.message).toMatch(/limite legal de 42h/);
    expect(issue?.message).toMatch(/EC 141\/2026/);
  });

  it('meta do setor abaixo do teto continua valendo e a mensagem não cita a lei', () => {
    const result = runOn('2026-12-21', ['T1', 'O', 'T1', 'T1', 'T1', 'T1', 'O'], { defaultSundayRule: 'CUSTOM', weeklyHoursTarget: 40 });
    const issue = weeklyHoursIssue(result);
    expect(issue?.details).toMatchObject({ targetMinutes: 40 * 60, limitSource: 'DEPARTMENT' });
    expect(issue?.message).toContain('(limite 40h)');
  });

  it('sem meta no setor aplica só o teto legal (40h a partir de 15/12/2027)', () => {
    const ok = runOn('2027-12-13', ['T1', 'O', 'T1', 'T1', 'T1', 'T1', 'O'], { defaultSundayRule: 'CUSTOM' });
    expect(weeklyHoursIssue(ok)).toBeUndefined();
    const result = runOn('2027-12-20', ['T1', 'O', 'T1', 'T1', 'T1', 'T1', 'O'], { defaultSundayRule: 'CUSTOM' });
    expect(weeklyHoursIssue(result)?.details).toMatchObject({ workedMinutes: 42 * 60, targetMinutes: 40 * 60, limitSource: 'LAW' });
  });
});

describe('três domingos seguidos (Lei 10.101/2000, art. 6º)', () => {
  const EARLIER_DATES = getWeekDates(addDays(WEEK, -14));
  /** Trabalha de quarta a domingo: o domingo é sempre trabalhado. */
  const SUNDAY_WORK = ['O', 'O', 'T1', 'T1', 'T1', 'T1', 'T1'];
  const custom = { defaultSundayRule: 'CUSTOM', weeklyHoursTarget: 42 };
  const sundayLaw = (result) => result.issues.filter((i) => i.code === ISSUE_CODES.SUNDAY_LAW);
  const runSundays = ({ current = SUNDAY_WORK, previous = SUNDAY_WORK, earlier, earlierDates = EARLIER_DATES, ...rest }) =>
    run({
      department: custom,
      employees: [emp('ana')],
      assignments: week('ana', current),
      previousAssignments: week('ana', previous, PREV_DATES),
      earlierAssignments: earlier ? week('ana', earlier, earlierDates) : undefined,
      ...rest,
    });

  it('3º domingo seguido trabalhado é vermelho, inclusive na regra CUSTOM', () => {
    const result = runSundays({ earlier: SUNDAY_WORK });
    const issues = sundayLaw(result);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: SEVERITY.RED, employeeId: 'ana', date: DATES[6] });
    expect(issues[0].details.sundays).toEqual([EARLIER_DATES[6], PREV_DATES[6], DATES[6]]);
    expect(issues[0].message).toContain('Lei 10.101/2000');
    expect(codes(result)).not.toContain(ISSUE_CODES.SUNDAY_ROTATION); // CUSTOM continua sem o amarelo de rodízio
    expect(getCellIssues(result, 'ana', DATES[6]).map((i) => i.code)).toContain(ISSUE_CODES.SUNDAY_LAW);
  });

  it('vale também para quem segue o rodízio 1 em 3', () => {
    const result = runSundays({
      earlier: SUNDAY_WORK,
      department: { defaultSundayRule: '1_IN_3', weeklyHoursTarget: 42 },
      employees: [emp('ana', { sundayGroup: WORK_GROUP })],
    });
    expect(sundayLaw(result)).toHaveLength(1);
  });

  it('sem a semana retrasada (histórico incompleto) não alerta', () => {
    expect(sundayLaw(runSundays({}))).toEqual([]);
  });

  it('folga ou ausência em um dos domingos anteriores não alerta', () => {
    expect(sundayLaw(runSundays({ earlier: ['T1', 'O', 'T1', 'T1', 'T1', 'T1', 'O'] }))).toEqual([]);
    expect(sundayLaw(runSundays({ earlier: SUNDAY_WORK, previous: ['O', 'O', 'T1', 'T1', 'T1', 'T1', 'A'] }))).toEqual([]);
  });

  it('folga no domingo da semana validada não alerta', () => {
    expect(sundayLaw(runSundays({ earlier: SUNDAY_WORK, current: ['T1', 'O', 'T1', 'T1', 'T1', 'T1', 'O'] }))).toEqual([]);
  });

  it('células de earlierAssignments fora da semana retrasada são ignoradas', () => {
    const result = runSundays({ earlier: SUNDAY_WORK, earlierDates: getWeekDates(addDays(WEEK, -21)) });
    expect(sundayLaw(result)).toEqual([]);
  });
});
