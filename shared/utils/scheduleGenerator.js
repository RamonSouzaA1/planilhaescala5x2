/**
 * Motor gerador 5x2 (spec, módulo 3). Algoritmo determinístico em 4 etapas:
 *   1. Travas e ausências: células isPinned, férias/atestados e dias indisponíveis são fixados.
 *   2. Domingos: aplica o rodízio (1 em 3 / 1 em 2) e considera a sequência de dias
 *      trabalhados no fim da semana anterior (OJ 410 SDI-1/TST: no máximo 6 seguidos).
 *   3. Folgas: escolhe as folgas restantes por custo — preferência de segunda a quarta,
 *      proteção de sexta a domingo e dos dias de pico, espalhamento entre os dias e
 *      penalidades para furo de cobertura mínima e de tags obrigatórias.
 *   4. Turnos: cada colaborador recebe um turno-base da semana (o da semana anterior ou
 *      um balanceado por tags e carga) e o turno do dia só muda para manter o descanso
 *      mínimo (11h entre dias seguidos; 35h quando há folga no meio).
 * Módulo puro, compartilhado entre web e api. O resultado já vem validado pelo cltValidator.
 */

import { addDays, getDayOfWeek, getWeekDates, isMonday, toDateKey } from './dateUtils.js';
import {
  getShiftWindow,
  getCoverageRuleForDay,
  getEmployeeAbsences,
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
const CONSECUTIVE_PENALTY = 10000;
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

  // Etapa 1 e 2: células fixas (travas, ausências, indisponibilidade, domingo do rodízio).
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
    const offBudget = () => totalOff - cells.filter((c) => c?.type === 'OFF').length;

    // Dias indisponíveis viram folga enquanto houver folgas a distribuir.
    const unavailableDays = employee.fixedConstraints?.unavailableDays ?? [];
    dates.forEach((date, i) => {
      if (!cells[i] && unavailableDays.includes(getDayOfWeek(date)) && offBudget() > 0) {
        cells[i] = { type: 'OFF', isPinned: false, fixed: true };
      }
    });

    // Domingo de folga pelo rodízio.
    const rule = resolveSundayRule(employee, department);
    if (
      !cells[6] &&
      offBudget() > 0 &&
      isSundayOffWeek(employee.sundayGroup, rule, weekStartDate, cycleOffset) === true
    ) {
      cells[6] = { type: 'OFF', isPinned: false, fixed: true };
    }

    const free = cells.flatMap((c, i) => (c ? [] : [i]));
    return {
      employee,
      order,
      cells,
      free,
      offNeeded: Math.max(0, Math.min(offBudget(), free.length)),
      trailing: getTrailingWorkStreak(previous, employee.id, weekStartDate),
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

  const breaksConsecutiveLimit = (plan, offs) => {
    let run = plan.trailing;
    for (let d = 0; d < 7; d += 1) {
      const type = plan.cells[d]?.type ?? (offs.includes(d) ? 'OFF' : 'WORK');
      run = type === 'WORK' ? run + 1 : 0;
      if (run > MAX_CONSECUTIVE_WORK_DAYS) return true;
    }
    return false;
  };

  const chooseOffs = (plan) => {
    let best = null;
    for (const offs of combinations(plan.free, plan.offNeeded)) {
      let cost = offs.reduce((sum, d) => sum + dayCost(plan, d), 0);
      if (breaksConsecutiveLimit(plan, offs)) cost += CONSECUTIVE_PENALTY;
      if (!best || cost < best.cost) best = { offs, cost };
    }
    return best.offs;
  };

  // Mais restritos primeiro: maior sequência herdada, mais células fixas.
  const queue = [...plans].sort(
    (a, b) => b.trailing - a.trailing || a.free.length - b.free.length || a.order - b.order,
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

    // Linha do tempo de 14 dias (semana anterior + atual), índice 0 = segunda anterior.
    const previousByDate = new Map(previous.filter((a) => a.employeeId === plan.employee.id).map((a) => [a.date, a]));
    const timeline = [
      ...getWeekDates(addDays(weekStartDate, -7)).map((date) => previousByDate.get(date)),
      ...plan.cells,
    ];

    /** Turno de trabalho mais próximo na direção `step`, com a distância e se há folga no meio. */
    const neighbour = (index, step, onlyPinned) => {
      let hasDayOff = false;
      for (let i = index + step; i >= 0 && i < timeline.length; i += step) {
        const cell = timeline[i];
        if (cell?.type === 'WORK') {
          if (onlyPinned && !cell.isPinned) return null;
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

    for (let d = 0; d < 7; d += 1) {
      const cell = plan.cells[d];
      if (cell.type !== 'WORK' || cell.isPinned) continue;
      const index = 7 + d;
      const before = neighbour(index, -1, false);
      const after = neighbour(index, +1, true);
      const fits = (shift) =>
        (!before || restOk(before.shift, shift, before.distance, before.hasDayOff)) &&
        (!after || restOk(shift, after.shift, after.distance, after.hasDayOff));
      cell.shiftId = (candidates.find(fits) ?? home).id;
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
    absences,
    coverageRules,
    department,
  });

  return { assignments, validation };
}
