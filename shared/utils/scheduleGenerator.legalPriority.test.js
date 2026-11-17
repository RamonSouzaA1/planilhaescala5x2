/**
 * Gerador versus OJ 410 e regra dos três domingos (revisão final, item 6).
 * Ordem de prioridade na escolha das folgas:
 *   lei (OJ 410, SUNDAY_LAW, 5x2, horas) > rodízio de domingo > restrição individual > custo.
 * Quando lei e preferências não cabem juntas, cede o rodízio ou a restrição (alerta AMARELO),
 * nunca a regra legal (alerta VERMELHO).
 */
import { describe, it, expect } from 'vitest';
import { generateSchedule } from './scheduleGenerator.js';
import { ISSUE_CODES, SEVERITY } from './cltValidator.js';
import { addDays, getWeekDates } from './dateUtils.js';
import { getSundayGroupCount, isSundayOffWeek } from './sundayRotation.js';

const WEEK = '2026-11-16'; // segunda-feira; teto legal de 44h, meta do setor 42h
const DATES = getWeekDates(WEEK);
const PREV_DATES = getWeekDates(addDays(WEEK, -7));
const EARLIER_SUNDAY = addDays(WEEK, -8);
const DAY_CODES = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'];
const RULES = ['1_IN_3', '1_IN_2', 'CUSTOM'];

const SHIFTS = [
  { id: 'T1', code: 'T1', name: 'Abertura', startTime: '07:00', endTime: '16:24', breakDurationMinutes: 60 },
  { id: 'T2', code: 'T2', name: 'Intermediário', startTime: '10:00', endTime: '19:24', breakDurationMinutes: 60 },
  { id: 'T3', code: 'T3', name: 'Fechamento', startTime: '12:36', endTime: '22:00', breakDurationMinutes: 60 },
];

/** Grupo que folga (ou trabalha) no domingo de `weekStartDate` pela regra; null se não houver. */
function groupFor(rule, sundayOff, weekStartDate = WEEK) {
  const groups = Array.from({ length: getSundayGroupCount(rule) }, (_, i) => i + 1);
  return groups.find((g) => isSundayOffWeek(g, rule, weekStartDate) === sundayOff) ?? 1;
}

/** Semana anterior com `trailing` dias de T1 no fim (o resto é folga). */
function previousWeek(employeeId, trailing) {
  return PREV_DATES.map((date, i) => ({
    id: `${employeeId}-${date}`,
    employeeId,
    date,
    type: i >= 7 - trailing ? 'WORK' : 'OFF',
    shiftId: i >= 7 - trailing ? 'T1' : undefined,
    isPinned: false,
  }));
}

/** Domingo da semana retrasada (só ele importa para a regra dos três domingos). */
function earlierSunday(employeeId, worked) {
  return [
    {
      id: `${employeeId}-${EARLIER_SUNDAY}`,
      employeeId,
      date: EARLIER_SUNDAY,
      type: worked ? 'WORK' : 'OFF',
      shiftId: worked ? 'T1' : undefined,
      isPinned: false,
    },
  ];
}

const employee = (id, extra = {}) => ({ id, name: `Pessoa ${id}`, tags: [], status: 'ACTIVE', ...extra });
const typesOf = (result, employeeId) =>
  DATES.map((date) => result.assignments.find((a) => a.employeeId === employeeId && a.date === date).type);
const redIssues = (result) => result.validation.issues.filter((i) => i.severity === SEVERITY.RED);
const issuesOf = (result, employeeId, code) =>
  result.validation.issues.filter((i) => i.employeeId === employeeId && i.code === code);

/** Todos os subconjuntos de dias (índices 0–6) com até `max` elementos. */
function daySubsets(max) {
  const result = [[]];
  for (let d = 0; d < 7; d += 1) {
    for (const subset of [...result]) if (subset.length < max) result.push([...subset, d]);
  }
  return result;
}

/** Todos os pares de folga possíveis na semana. */
const OFF_PAIRS = DATES.flatMap((_, a) => DATES.flatMap((__, b) => (b > a ? [[a, b]] : [])));

/**
 * Referência por força bruta: menor (rodízio violado, restrições violadas) entre as escolhas
 * de 2 folgas que respeitam a lei. null quando nenhuma escolha respeita a lei.
 */
function bestConcessions({ trailing, sundayLawRequired, rotationOff, unavailable }) {
  let best = null;
  for (const pair of OFF_PAIRS) {
    const works = DATES.map((_, d) => !pair.includes(d));
    let run = trailing;
    let legal = true;
    for (const w of works) {
      run = w ? run + 1 : 0;
      if (run > 6) legal = false;
    }
    if (sundayLawRequired && works[6]) legal = false;
    if (!legal) continue;
    const score = [rotationOff && works[6] ? 1 : 0, unavailable.filter((d) => works[d]).length];
    if (!best || score[0] < best[0] || (score[0] === best[0] && score[1] < best[1])) best = score;
  }
  return best;
}

describe('reprodução da revisão final (item 6)', () => {
  it('6 dias herdados + QUA indisponível + domingo de folga no rodízio: folga na segunda, sem vermelho', () => {
    const result = generateSchedule({
      weekStartDate: WEEK,
      shifts: SHIFTS,
      department: { defaultSundayRule: '1_IN_3', weeklyHoursTarget: 42 },
      employees: [employee('e0', { sundayGroup: groupFor('1_IN_3', true), fixedConstraints: { unavailableDays: ['QUA'] } })],
      previousAssignments: previousWeek('e0', 6),
    });
    const types = typesOf(result, 'e0');
    expect(types[0]).toBe('OFF'); // OJ 410: 7º dia seguido seria a segunda
    expect(types[6]).toBe('OFF'); // rodízio vale mais que a restrição individual
    expect(types[2]).toBe('WORK'); // a restrição cede: alerta amarelo
    expect(redIssues(result)).toEqual([]);
    expect(issuesOf(result, 'e0', ISSUE_CODES.CONSECUTIVE_DAYS)).toEqual([]);
    const restriction = issuesOf(result, 'e0', ISSUE_CODES.RESTRICTION);
    expect(restriction).toHaveLength(1);
    expect(restriction[0].severity).toBe(SEVERITY.YELLOW);
  });

  it('3 indisponíveis + domingo legal obrigatório + 6 dias herdados: só amarelo, nunca OJ 410', () => {
    const result = generateSchedule({
      weekStartDate: WEEK,
      shifts: SHIFTS,
      department: { defaultSundayRule: 'CUSTOM', weeklyHoursTarget: 42 },
      employees: [employee('e0', { sundayGroup: 1, fixedConstraints: { unavailableDays: ['TER', 'QUA', 'QUI'] } })],
      previousAssignments: previousWeek('e0', 6),
      earlierAssignments: earlierSunday('e0', true),
    });
    expect(typesOf(result, 'e0')).toEqual(['OFF', 'WORK', 'WORK', 'WORK', 'WORK', 'WORK', 'OFF']);
    expect(redIssues(result)).toEqual([]);
    expect(issuesOf(result, 'e0', ISSUE_CODES.RESTRICTION)).toHaveLength(3);
  });

  it('5 dias herdados + QUI e SEX indisponíveis + domingo do rodízio: folga até a terça', () => {
    const result = generateSchedule({
      weekStartDate: WEEK,
      shifts: SHIFTS,
      department: { defaultSundayRule: '1_IN_3', weeklyHoursTarget: 42 },
      employees: [employee('e0', { sundayGroup: groupFor('1_IN_3', true), fixedConstraints: { unavailableDays: ['QUI', 'SEX'] } })],
      previousAssignments: previousWeek('e0', 5),
    });
    const types = typesOf(result, 'e0');
    expect(types[0] === 'OFF' || types[1] === 'OFF').toBe(true);
    expect(redIssues(result)).toEqual([]);
  });

  it('rodízio de domingo vale mais que restrição individual', () => {
    const result = generateSchedule({
      weekStartDate: WEEK,
      shifts: SHIFTS,
      department: { defaultSundayRule: '1_IN_3', weeklyHoursTarget: 42 },
      employees: [employee('e0', { sundayGroup: groupFor('1_IN_3', true), fixedConstraints: { unavailableDays: ['SEG', 'TER'] } })],
    });
    const types = typesOf(result, 'e0');
    expect(types[6]).toBe('OFF');
    expect(types[0] === 'OFF' || types[1] === 'OFF').toBe(true);
    expect(issuesOf(result, 'e0', ISSUE_CODES.SUNDAY_ROTATION)).toEqual([]);
    expect(issuesOf(result, 'e0', ISSUE_CODES.RESTRICTION)).toHaveLength(1);
  });

  it('sem conflito, dias indisponíveis continuam virando folga', () => {
    const result = generateSchedule({
      weekStartDate: WEEK,
      shifts: SHIFTS,
      department: { defaultSundayRule: '1_IN_3', weeklyHoursTarget: 42 },
      employees: [employee('e0', { sundayGroup: groupFor('1_IN_3', false), fixedConstraints: { unavailableDays: ['TER', 'SEX'] } })],
      previousAssignments: previousWeek('e0', 2),
    });
    expect(typesOf(result, 'e0')).toEqual(['WORK', 'OFF', 'WORK', 'WORK', 'OFF', 'WORK', 'WORK']);
    expect(result.validation.status).toBe('GREEN');
  });

  it('sem solução legal por célula travada: só o vermelho inevitável, e a regra dos domingos é mantida', () => {
    const pinnedMonday = { employeeId: 'e0', date: DATES[0], type: 'WORK', shiftId: 'T1', isPinned: true };
    const result = generateSchedule({
      weekStartDate: WEEK,
      shifts: SHIFTS,
      department: { defaultSundayRule: 'CUSTOM', weeklyHoursTarget: 42 },
      employees: [employee('e0', { sundayGroup: 1, fixedConstraints: { unavailableDays: ['DOM'] } })],
      previousAssignments: previousWeek('e0', 6),
      earlierAssignments: earlierSunday('e0', true),
      existingAssignments: [pinnedMonday],
    });
    const types = typesOf(result, 'e0');
    expect(types[0]).toBe('WORK'); // trava preservada: o 7º dia é inevitável
    expect(types[1]).toBe('OFF'); // a sequência termina no primeiro dia possível
    expect(types[6]).toBe('OFF'); // e o terceiro domingo não é trabalhado
    expect(redIssues(result).map((i) => i.code)).toEqual([ISSUE_CODES.CONSECUTIVE_DAYS]);
  });
});

describe('varredura adversarial: nenhum vermelho quando existe solução legal', () => {
  const SUBSETS = daySubsets(3); // 64 conjuntos de 0 a 3 dias indisponíveis
  const TRAILING = [0, 1, 2, 3, 4, 5, 6];
  const SIZES = [1, 2, 3, 4, 5, 6, 7];
  // CUSTOM não tem rodízio: só uma variante de domingo.
  const ROTATIONS = RULES.flatMap((rule) => (rule === 'CUSTOM' ? [[rule, false]] : [[rule, true], [rule, false]]));

  /** Cenário: todos herdam a mesma sequência; e0 leva os dias indisponíveis e o domingo pedido. */
  function scenario({ rule, sundayOff, trailing, earlierWorked, subset, n }) {
    const groupCount = getSundayGroupCount(rule);
    const employees = Array.from({ length: n }, (_, i) => {
      const unavailable = subset.map((d) => (d + i) % 7);
      return employee(`e${i}`, {
        sundayGroup: i === 0 ? groupFor(rule, sundayOff) : (i % groupCount) + 1,
        fixedConstraints: { unavailableDays: unavailable.map((d) => DAY_CODES[d]) },
      });
    });
    // Cobertura adversarial: todos na segunda e no domingo (puxa contra a folga obrigatória).
    const coverageRules = ['SEG', 'DOM'].map((dayOfWeek) => ({ id: dayOfWeek, dayOfWeek, minTotalStaff: n, requiredTags: [] }));
    const department = { defaultSundayRule: rule, weeklyHoursTarget: 42 };
    const result = generateSchedule({
      weekStartDate: WEEK,
      shifts: SHIFTS,
      department,
      employees,
      coverageRules,
      previousAssignments: employees.flatMap((e) => previousWeek(e.id, trailing)),
      earlierAssignments: employees.flatMap((e) => earlierSunday(e.id, earlierWorked)),
    });
    return { employees, result };
  }

  it('trailing 0–6 × 0–3 indisponíveis × domingo sim/não × 1_IN_3/1_IN_2/CUSTOM × domingo retrasado × N = 1..7', () => {
    const stats = { scenarios: 0, withoutLegalSolution: 0, withConcession: 0, failures: [] };
    for (const [rule, sundayOff] of ROTATIONS) {
      for (const trailing of TRAILING) {
        for (const earlierWorked of [false, true]) {
          for (const subset of SUBSETS) {
            for (const n of SIZES) {
              stats.scenarios += 1;
              const { employees, result } = scenario({ rule, sundayOff, trailing, earlierWorked, subset, n });
              const red = redIssues(result);
              let anyConcession = false;
              let anyWithoutLegal = false;
              for (const e of employees) {
                const unavailable = e.fixedConstraints.unavailableDays.map((c) => DAY_CODES.indexOf(c));
                const expected = bestConcessions({
                  trailing,
                  sundayLawRequired: trailing > 0 && earlierWorked,
                  rotationOff: isSundayOffWeek(e.sundayGroup, rule, WEEK) === true,
                  unavailable,
                });
                if (!expected) {
                  anyWithoutLegal = true;
                  continue;
                }
                const actual = [
                  issuesOf(result, e.id, ISSUE_CODES.SUNDAY_ROTATION).length,
                  issuesOf(result, e.id, ISSUE_CODES.RESTRICTION).length,
                ];
                if (expected[0] + expected[1] > 0) anyConcession = true;
                if (actual[0] !== expected[0] || actual[1] !== expected[1]) {
                  stats.failures.push({ rule, sundayOff, trailing, earlierWorked, subset, n, employee: e.id, expected, actual });
                }
              }
              if (anyWithoutLegal) stats.withoutLegalSolution += 1;
              else if (red.length) {
                stats.failures.push({ rule, sundayOff, trailing, earlierWorked, subset, n, red: red.map((i) => `${i.employeeId}:${i.code}`) });
              }
              if (anyConcession) stats.withConcession += 1;
            }
          }
        }
      }
    }
    expect(stats.failures.slice(0, 5)).toEqual([]);
    expect(stats.scenarios).toBe(5 * 7 * 2 * 64 * 7);
    // Com duas folgas livres sempre há solução legal (segunda e domingo); o que falta é só
    // espaço para as preferências, que cedem com alerta amarelo.
    expect(stats.withoutLegalSolution).toBe(0);
    // Cenários em que a referência por força bruta exige ao menos um amarelo (rodízio ou
    // restrição cedendo para a lei): o gerador cede exatamente o mínimo em cada um deles.
    expect(stats.withConcession).toBe(27312);
  }, 300_000);
});

describe('4 semanas encadeadas com restrições e sequência herdada', () => {
  const WEEKS = [0, 1, 2, 3].map((i) => addDays(WEEK, 7 * i));
  const PATTERNS = [[], ['QUA'], ['SEG', 'DOM'], ['TER', 'QUA', 'QUI'], ['SEG', 'SAB', 'DOM']];

  function chain({ rule, trailing, pattern, n }) {
    const groupCount = getSundayGroupCount(rule);
    const employees = Array.from({ length: n }, (_, i) =>
      employee(`e${i}`, {
        sundayGroup: (i % groupCount) + 1,
        fixedConstraints: { unavailableDays: pattern.map((c) => DAY_CODES[(DAY_CODES.indexOf(c) + i) % 7]) },
      }),
    );
    const department = { defaultSundayRule: rule, weeklyHoursTarget: 42 };
    const history = [
      employees.flatMap((e) => earlierSunday(e.id, true)),
      employees.flatMap((e) => previousWeek(e.id, trailing)),
    ];
    const results = [];
    for (const weekStartDate of WEEKS) {
      const result = generateSchedule({
        weekStartDate,
        shifts: SHIFTS,
        department,
        employees,
        previousAssignments: history[history.length - 1],
        earlierAssignments: history[history.length - 2].map((a) => ({ ...a })),
      });
      results.push(result);
      history.push(result.assignments);
    }
    return { employees, results };
  }

  it('trailing 0–6 × 5 padrões de restrição × 3 regras × N = 1..7: nenhum vermelho em nenhuma semana', () => {
    const failures = [];
    let chains = 0;
    for (const rule of RULES) {
      for (const trailing of [0, 1, 2, 3, 4, 5, 6]) {
        for (const pattern of PATTERNS) {
          for (const n of [1, 2, 3, 4, 5, 6, 7]) {
            chains += 1;
            const { results } = chain({ rule, trailing, pattern, n });
            results.forEach((result, w) => {
              const red = redIssues(result);
              if (red.length) failures.push({ rule, trailing, pattern, n, week: WEEKS[w], red: red.map((i) => `${i.employeeId}:${i.code}`) });
            });
          }
        }
      }
    }
    expect(failures.slice(0, 5)).toEqual([]);
    expect(chains).toBe(3 * 7 * 5 * 7);
  }, 120_000);
});
