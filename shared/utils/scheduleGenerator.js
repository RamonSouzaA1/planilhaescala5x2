/**
 * Motor gerador 5x2 (spec, módulo 3). Algoritmo determinístico em 4 etapas:
 *   1. Travas e ausências: células isPinned e férias/atestados são fixados.
 *   2. Restrições de cada colaborador: sequência de dias trabalhados no fim da semana anterior
 *      e no início da semana seguinte já gravada (OJ 410 SDI-1/TST: no máximo 6 seguidos),
 *      folga obrigatória no domingo quando os dois anteriores foram trabalhados
 *      (Lei 10.101/2000, art. 6º), domingo do rodízio (1 em 3 / 1 em 2) e dias indisponíveis.
 *   3. Folgas: todas as combinações de folgas nos dias livres são comparadas em ordem de
 *      prioridade — lei (OJ 410 e terceiro domingo) > rodízio > restrição individual > custo.
 *      Quando não cabe tudo, cedem o rodízio ou a restrição (alerta amarelo), nunca a lei.
 *      O custo prefere folgas de segunda a quarta, protege sexta a domingo e os dias de pico,
 *      espalha as folgas e penaliza furo de cobertura mínima e de tags obrigatórias.
 *   4. Turnos: cada colaborador recebe um turno-base da semana (o da semana anterior ou
 *      um balanceado por tags e carga) e o turno do dia só muda para manter o descanso
 *      mínimo (11h entre dias seguidos; 35h quando há folga no meio) ou para caber no limite
 *      semanal (menor entre a meta do setor e o teto legal da data, EC 141/2026).
 * Módulo puro, compartilhado entre web e api. O resultado já vem validado pelo cltValidator.
 */

import { addDays, getDayOfWeek, getWeekDates, isMonday, toDateKey } from './dateUtils.js';
import {
  getShiftWindow,
  getShiftLegalMinutes,
  getCoverageRuleForDay,
  getEmployeeAbsences,
  getWeeklyHoursLimit,
  validateSchedule,
  MIN_INTERJORNADA_MINUTES,
  MIN_WEEKLY_REST_MINUTES,
  MAX_CONSECUTIVE_WORK_DAYS,
  OFF_DAYS_PER_WEEK,
  WORK_DAYS_PER_WEEK,
} from './cltValidator.js';
import { isSundayOffWeek, resolveSundayRule } from './sundayRotation.js';

/** Custo base de folgar em cada dia (segunda → domingo): folgas concentradas de segunda a quarta. */
const OFF_DAY_BASE_COST = [0, 0, 0, 3, 6, 9, 12];
/** Peso do espalhamento: quanto mais folgas já há no dia (proporcional a N), mais caro folgar nele. */
const SPREAD_WEIGHT = 30;
const PEAK_DATE_COST = 15;
const COVERAGE_PENALTY = 1000;
const TAG_PENALTY = 500;
const REFINEMENT_PASSES = 2;

/**
 * Quantos dias seguidos o colaborador trabalhou no fim da semana anterior.
 * @param {any[]} previousAssignments
 * @param {string} employeeId
 * @param {string} weekStartDate
 * @returns {number}
 */
export function getTrailingWorkStreak(previousAssignments, employeeId, weekStartDate) {
  const workDates = new Set(
    previousAssignments
      .filter((a) => a.employeeId === employeeId && a.type === 'WORK')
      .map((a) => toDateKey(a.date)),
  );
  let streak = 0;
  while (workDates.has(addDays(weekStartDate, -(streak + 1)))) streak += 1;
  return streak;
}

/**
 * Quantos dias seguidos o colaborador já tem de trabalho no início da semana seguinte.
 * @param {any[]} nextAssignments
 * @param {string} employeeId
 * @param {string} weekStartDate - segunda-feira da semana gerada
 * @returns {number}
 */
export function getLeadingWorkStreak(nextAssignments, employeeId, weekStartDate) {
  const workDates = new Set(
    nextAssignments
      .filter((a) => a.employeeId === employeeId && a.type === 'WORK')
      .map((a) => toDateKey(a.date)),
  );
  let streak = 0;
  while (streak < 7 && workDates.has(addDays(weekStartDate, 7 + streak))) streak += 1;
  return streak;
}

/**
 * Indica se o colaborador trabalhou os dois domingos anteriores à semana (W-2 e W-1).
 * Sem a célula de algum deles (histórico ausente), devolve false.
 * @param {any[]} history - atribuições das semanas anteriores (datas normalizadas)
 * @param {string} employeeId
 * @param {string} weekStartDate
 * @returns {boolean}
 */
export function workedLastTwoSundays(history, employeeId, weekStartDate) {
  const sundays = new Set([addDays(weekStartDate, -8), addDays(weekStartDate, -1)]);
  const worked = history.filter((a) => a.employeeId === employeeId && a.type === 'WORK' && sundays.has(a.date));
  return new Set(worked.map((a) => a.date)).size === sundays.size;
}

/** Todas as combinações de `k` itens de `items`, em ordem lexicográfica. */
function combinations(items, k) {
  if (k === 0) return [[]];
  const result = [];
  items.forEach((item, i) => {
    for (const rest of combinations(items.slice(i + 1), k - 1)) result.push([item, ...rest]);
  });
  return result;
}

/**
 * Gera a escala semanal de um setor.
 * @param {Object} input
 * @param {string} input.weekStartDate - segunda-feira da semana
 * @param {any[]} input.employees
 * @param {any[]} [input.shifts]
 * @param {any[]} [input.previousAssignments] - semana anterior (virada de semana e turno-base)
 * @param {any[]} [input.earlierAssignments] - semana retrasada (regra dos três domingos seguidos)
 * @param {any[]} [input.nextAssignments] - semana seguinte já gravada: tratada como travada
 *   (descanso até o primeiro turno dela e sequência de dias na virada)
 * @param {any[]} [input.existingAssignments] - semana atual; só as isPinned são preservadas
 * @param {any[]} [input.absences]
 * @param {any[]} [input.coverageRules]
 * @param {{ defaultSundayRule?: string, weeklyHoursTarget?: number, sundayCycleOffset?: number }} [input.department]
 * @param {string[]} [input.peakDates] - datas de pico (feriados, datas comemorativas)
 * @param {string} [input.scheduleCycleId]
 * @returns {{ assignments: any[], validation: import('./cltValidator.js').ValidationResult }}
 * @throws {Error} se weekStartDate não for segunda-feira ou algum turno tiver horário inválido
 */
export function generateSchedule({
  weekStartDate,
  employees = [],
  shifts = [],
  previousAssignments = [],
  earlierAssignments = [],
  nextAssignments = [],
  existingAssignments = [],
  absences = [],
  coverageRules = [],
  department = {},
  peakDates = [],
  scheduleCycleId,
}) {
  if (!isMonday(weekStartDate)) throw new Error(`weekStartDate deve ser uma segunda-feira: ${weekStartDate}`);

  const dates = getWeekDates(weekStartDate);
  const active = employees.filter((e) => e.status !== 'INACTIVE');
  const shiftById = new Map(shifts.map((s) => [s.id, s]));
  for (const shift of shifts) getShiftWindow(shift); // falha cedo em horário inválido
  const peakDateSet = new Set(peakDates.map(toDateKey));
  const cycleOffset = Number(department?.sundayCycleOffset) || 0;
  const rules = dates.map((date) => getCoverageRuleForDay(coverageRules, getDayOfWeek(date)));
  const coverageTags = [...new Set(rules.flatMap((r) => (r?.requiredTags ?? []).map((t) => t.tag)))];
  const pinnedByKey = new Map(
    existingAssignments.filter((a) => a.isPinned).map((a) => [`${a.employeeId}|${toDateKey(a.date)}`, a]),
  );
  const previous = previousAssignments.map((a) => ({ ...a, date: toDateKey(a.date) }));
  const earlierDates = getWeekDates(addDays(weekStartDate, -14));
  const earlier = earlierAssignments
    .map((a) => ({ ...a, date: toDateKey(a.date) }))
    .filter((a) => earlierDates.includes(a.date));
  const weeklyLimitMinutes = getWeeklyHoursLimit(weekStartDate, department).minutes;
  const nextDates = getWeekDates(addDays(weekStartDate, 7));
  const next = nextAssignments
    .map((a) => ({ ...a, date: toDateKey(a.date) }))
    .filter((a) => nextDates.includes(a.date));

  // Etapa 1: células fixas (travas e ausências). Etapa 2: o que cada folga precisa respeitar.
  const plans = active.map((employee, order) => {
    const absenceMap = getEmployeeAbsences(employee, absences, dates);
    const cells = dates.map((date) => {
      const pinned = pinnedByKey.get(`${employee.id}|${date}`);
      if (pinned) return { type: pinned.type, shiftId: pinned.shiftId, isPinned: true, fixed: true };
      if (absenceMap.has(date)) return { type: 'ABSENCE', isPinned: false, fixed: true };
      return null;
    });

    // Atestado e outras ausências ocupam dias de trabalho (as 2 folgas continuam devidas);
    // em semanas com férias, apenas não se passa de 5 dias de trabalho.
    const absenceCount = cells.filter((c) => c?.type === 'ABSENCE').length;
    const hasVacation = [...absenceMap.values()].includes('VACATION');
    const totalOff = hasVacation
      ? 7 - absenceCount - Math.min(WORK_DAYS_PER_WEEK, 7 - absenceCount)
      : Math.min(OFF_DAYS_PER_WEEK, 7 - absenceCount);
    const offBudget = totalOff - cells.filter((c) => c?.type === 'OFF').length;
    const free = cells.flatMap((c, i) => (c ? [] : [i]));
    const unavailableDays = employee.fixedConstraints?.unavailableDays ?? [];
    const rule = resolveSundayRule(employee, department);

    return {
      employee,
      order,
      cells,
      free,
      offNeeded: Math.max(0, Math.min(offBudget, free.length)),
      trailing: getTrailingWorkStreak(previous, employee.id, weekStartDate),
      leading: getLeadingWorkStreak(next, employee.id, weekStartDate),
      // Terceiro domingo seguido é infração (Lei 10.101/2000, art. 6º).
      sundayLaw: workedLastTwoSundays([...earlier, ...previous], employee.id, weekStartDate),
      rotationSundayOff: isSundayOffWeek(employee.sundayGroup, rule, weekStartDate, cycleOffset) === true,
      unavailable: free.filter((d) => unavailableDays.includes(getDayOfWeek(dates[d]))),
      tags: (employee.tags ?? []).filter((t) => coverageTags.includes(t)),
      offs: [],
    };
  });

  // Etapa 3: estado por dia, considerando como trabalho os dias ainda livres.
  const isOffType = (type) => type === 'OFF' || type === 'ABSENCE';
  const working = dates.map((_, d) => plans.filter((p) => !isOffType(p.cells[d]?.type)).length);
  const offCount = dates.map((_, d) => plans.filter((p) => p.cells[d]?.type === 'OFF').length);
  const tagWorking = Object.fromEntries(
    coverageTags.map((tag) => [
      tag,
      dates.map((_, d) => plans.filter((p) => p.tags.includes(tag) && !isOffType(p.cells[d]?.type)).length),
    ]),
  );
  const teamSize = Math.max(plans.length, 1);

  const applyOffs = (plan, offs, delta) => {
    for (const d of offs) {
      offCount[d] += delta;
      working[d] -= delta;
      for (const tag of plan.tags) tagWorking[tag][d] -= delta;
    }
  };

  const dayCost = (plan, d) => {
    let cost = OFF_DAY_BASE_COST[d] + (SPREAD_WEIGHT * offCount[d]) / teamSize;
    if (peakDateSet.has(dates[d])) cost += PEAK_DATE_COST;
    const rule = rules[d];
    if (rule && working[d] - 1 < rule.minTotalStaff) cost += COVERAGE_PENALTY;
    for (const { tag, minCount } of rule?.requiredTags ?? []) {
      if (plan.tags.includes(tag) && tagWorking[tag][d] - 1 < minCount) cost += TAG_PENALTY;
    }
    return cost;
  };

  const isWorkDay = (plan, offs, d) => (plan.cells[d]?.type ?? (offs.includes(d) ? 'OFF' : 'WORK')) === 'WORK';

  /**
   * Dias que passam do 6º seguido (OJ 410), contando a sequência herdada da semana anterior e
   * a que continua na semana seguinte já gravada. Zero quando a escolha respeita a regra.
   */
  const consecutiveExcess = (plan, offs) => {
    let run = plan.trailing;
    let excess = 0;
    for (let d = 0; d < 7; d += 1) {
      run = isWorkDay(plan, offs, d) ? run + 1 : 0;
      if (run > MAX_CONSECUTIVE_WORK_DAYS) excess += 1;
    }
    if (run === 0) return excess;
    for (let j = 1; j <= plan.leading; j += 1) if (run + j > MAX_CONSECUTIVE_WORK_DAYS) excess += 1;
    return excess;
  };

  /**
   * Custo da escolha em ordem de prioridade, comparado posição a posição:
   * [lei (OJ 410 e terceiro domingo), rodízio de domingo, restrições individuais, preferência].
   * O 5x2 já vem garantido pelo número de folgas e as horas, pela etapa 4. Assim, quando nem
   * tudo cabe, cedem o rodízio ou a restrição (alerta amarelo), nunca a regra legal.
   */
  const offsScore = (plan, offs) => {
    const sundayWorked = isWorkDay(plan, offs, 6);
    return [
      consecutiveExcess(plan, offs) + (plan.sundayLaw && sundayWorked ? 1 : 0),
      plan.rotationSundayOff && sundayWorked ? 1 : 0,
      plan.unavailable.filter((d) => !offs.includes(d)).length,
      offs.reduce((sum, d) => sum + dayCost(plan, d), 0),
    ];
  };
  const isBetter = (a, b) => {
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i] < b[i];
    return false;
  };

  const chooseOffs = (plan) => {
    let best = null;
    for (const offs of combinations(plan.free, plan.offNeeded)) {
      const score = offsScore(plan, offs);
      if (!best || isBetter(score, best.score)) best = { offs, score };
    }
    return best.offs;
  };

  // Mais restritos primeiro: maior sequência herdada, mais preferências a encaixar, menos dias livres.
  const rigidity = (plan) => Number(plan.sundayLaw) + Number(plan.rotationSundayOff) + plan.unavailable.length;
  const queue = [...plans].sort(
    (a, b) =>
      b.trailing - a.trailing || rigidity(b) - rigidity(a) || a.free.length - b.free.length || a.order - b.order,
  );
  for (let pass = 0; pass <= REFINEMENT_PASSES; pass += 1) {
    for (const plan of queue) {
      applyOffs(plan, plan.offs, -1);
      plan.offs = chooseOffs(plan);
      applyOffs(plan, plan.offs, +1);
    }
  }
  for (const plan of plans) {
    for (const d of plan.free) {
      plan.cells[d] = { type: plan.offs.includes(d) ? 'OFF' : 'WORK', isPinned: false, fixed: false };
    }
  }

  // Etapa 4: turno-base da semana e turno de cada dia.
  const shiftOrder = [...shifts].sort((a, b) => getShiftWindow(a).start - getShiftWindow(b).start);
  const eligibleShifts = (employee) =>
    shiftOrder.filter((s) => !(employee.fixedConstraints?.unavailableShiftIds ?? []).includes(s.id));

  const load = new Map(shiftOrder.map((s) => [s.id, 0]));
  const tagLoad = Object.fromEntries(coverageTags.map((tag) => [tag, new Map(shiftOrder.map((s) => [s.id, 0]))]));
  const homeShift = new Map();
  const assignHome = (plan, shift) => {
    homeShift.set(plan.employee.id, shift);
    load.set(shift.id, load.get(shift.id) + 1);
    for (const tag of plan.tags) tagLoad[tag].set(shift.id, tagLoad[tag].get(shift.id) + 1);
  };

  const withoutHome = [];
  for (const plan of plans) {
    const eligible = eligibleShifts(plan.employee);
    const previousShiftIds = previous
      .filter((a) => a.employeeId === plan.employee.id && a.type === 'WORK' && shiftById.has(a.shiftId))
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((a) => a.shiftId);
    const frequency = new Map();
    for (const id of previousShiftIds) frequency.set(id, (frequency.get(id) ?? 0) + 1);
    const previousHome = [...frequency.entries()]
      .filter(([id]) => eligible.some((s) => s.id === id))
      .sort((a, b) => b[1] - a[1] || previousShiftIds.lastIndexOf(b[0]) - previousShiftIds.lastIndexOf(a[0]))[0];
    if (previousHome) assignHome(plan, shiftById.get(previousHome[0]));
    else if (eligible.length) withoutHome.push(plan);
  }
  withoutHome.sort((a, b) => (b.tags.length > 0) - (a.tags.length > 0) || a.order - b.order);
  for (const plan of withoutHome) {
    const scored = eligibleShifts(plan.employee).map((shift, index) => ({
      shift,
      tagScore: plan.tags.reduce((sum, tag) => sum + tagLoad[tag].get(shift.id), 0),
      load: load.get(shift.id),
      index,
    }));
    scored.sort((a, b) => a.tagScore - b.tagScore || a.load - b.load || a.index - b.index);
    assignHome(plan, scored[0].shift);
  }

  for (const plan of plans) {
    const home = homeShift.get(plan.employee.id);
    if (!home) continue;
    const eligible = eligibleShifts(plan.employee);
    const homeStart = getShiftWindow(home).start;
    const candidates = [
      home,
      ...eligible
        .filter((s) => s.id !== home.id)
        .sort((a, b) => Math.abs(getShiftWindow(a).start - homeStart) - Math.abs(getShiftWindow(b).start - homeStart)),
    ];

    // Linha do tempo de 21 dias (semana anterior + atual + seguinte), índice 0 = segunda anterior.
    // As células da semana seguinte já estão gravadas e contam como travadas.
    const previousByDate = new Map(previous.filter((a) => a.employeeId === plan.employee.id).map((a) => [a.date, a]));
    const nextByDate = new Map(next.filter((a) => a.employeeId === plan.employee.id).map((a) => [a.date, a]));
    const timeline = [
      ...getWeekDates(addDays(weekStartDate, -7)).map((date) => previousByDate.get(date)),
      ...plan.cells,
      ...nextDates.map((date) => nextByDate.get(date)),
    ];
    const NEXT_WEEK_INDEX = 14;

    /** Turno de trabalho mais próximo na direção `step`, com a distância e se há folga no meio. */
    const neighbour = (index, step, onlyPinned) => {
      let hasDayOff = false;
      for (let i = index + step; i >= 0 && i < timeline.length; i += step) {
        const cell = timeline[i];
        if (cell?.type === 'WORK') {
          if (onlyPinned && !cell.isPinned && i < NEXT_WEEK_INDEX) return null;
          const shift = shiftById.get(cell.shiftId);
          return shift ? { shift, distance: Math.abs(i - index), hasDayOff } : null;
        }
        if (!cell || cell.type === 'OFF') hasDayOff = true;
      }
      return null;
    };
    const restOk = (earlier, later, distance, hasDayOff) =>
      getShiftWindow(later).start + distance * 1440 - getShiftWindow(earlier).end >=
      (hasDayOff ? MIN_WEEKLY_REST_MINUTES : MIN_INTERJORNADA_MINUTES);

    // Limite semanal: o turno do dia só entra se ainda couberem os dias restantes no turno mais curto.
    const minLegal = Math.min(...candidates.map(getShiftLegalMinutes));
    const pinnedMinutes = plan.cells
      .filter((c) => c.isPinned && c.type === 'WORK' && shiftById.has(c.shiftId))
      .reduce((sum, c) => sum + getShiftLegalMinutes(shiftById.get(c.shiftId)), 0);
    let freeWorkDaysLeft = plan.cells.filter((c) => c.type === 'WORK' && !c.isPinned).length;
    let assignedMinutes = 0;

    for (let d = 0; d < 7; d += 1) {
      const cell = plan.cells[d];
      if (cell.type !== 'WORK' || cell.isPinned) continue;
      freeWorkDaysLeft -= 1;
      const index = 7 + d;
      const before = neighbour(index, -1, false);
      const after = neighbour(index, +1, true);
      const fits = (shift) =>
        (!before || restOk(before.shift, shift, before.distance, before.hasDayOff)) &&
        (!after || restOk(shift, after.shift, after.distance, after.hasDayOff));
      const withinLimit = (shift) =>
        pinnedMinutes + assignedMinutes + getShiftLegalMinutes(shift) + freeWorkDaysLeft * minLegal <= weeklyLimitMinutes;
      const restFitting = candidates.filter(fits);
      const shortest = [...restFitting].sort((a, b) => getShiftLegalMinutes(a) - getShiftLegalMinutes(b))[0];
      const chosen = restFitting.find(withinLimit) ?? shortest ?? home;
      cell.shiftId = chosen.id;
      assignedMinutes += getShiftLegalMinutes(chosen);
    }
  }

  const assignments = plans.flatMap((plan) =>
    dates.map((date, d) => {
      const cell = plan.cells[d];
      return {
        id: `${plan.employee.id}_${date}`,
        scheduleCycleId,
        employeeId: plan.employee.id,
        date,
        dayOfWeek: getDayOfWeek(date),
        type: cell.type,
        shiftId: cell.type === 'WORK' ? cell.shiftId : undefined,
        isPinned: cell.isPinned,
      };
    }),
  );

  const validation = validateSchedule({
    weekStartDate,
    employees,
    shifts,
    assignments,
    previousAssignments: previous,
    earlierAssignments: earlier,
    nextAssignments: next,
    absences,
    coverageRules,
    department,
  });

  return { assignments, validation };
}
