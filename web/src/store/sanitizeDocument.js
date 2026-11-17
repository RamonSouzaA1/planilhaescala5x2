/**
 * Higieniza o documento lido do localStorage. Dado corrompido (ex.: turno com horário vazio, que
 * faz o validador lançar erro) é descartado para o app abrir em estado seguro em vez de tela branca.
 */

const ARRAY_KEYS = ['departments', 'employees', 'shifts', 'coverageRules', 'absences', 'assignments'];
const TIME_PATTERN = /^([01]\d|2[0-3]|24):[0-5]\d$/;

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasValidTimes = (shift) => TIME_PATTERN.test(shift.startTime ?? '') && TIME_PATTERN.test(shift.endTime ?? '');

/**
 * @param {unknown} saved - estado persistido (qualquer coisa)
 * @returns {{ document: object, discarded: boolean }} document só traz campos válidos; discarded = algo foi descartado
 */
export function sanitizeDocument(saved) {
  if (!isRecord(saved)) return { document: {}, discarded: saved !== undefined && saved !== null };

  const document = {};
  let discarded = false;
  for (const key of ARRAY_KEYS) {
    if (!(key in saved)) continue;
    if (!Array.isArray(saved[key])) return { document: {}, discarded: true };
    const items = saved[key].filter(isRecord);
    if (items.length !== saved[key].length) discarded = true;
    document[key] = items;
  }

  if (document.shifts) {
    const valid = document.shifts.filter(hasValidTimes);
    const removed = new Set(document.shifts.filter((s) => !hasValidTimes(s)).map((s) => s.id));
    if (removed.size || valid.length !== document.shifts.length) {
      discarded = true;
      document.shifts = valid;
      if (document.assignments) document.assignments = document.assignments.filter((a) => !removed.has(a.shiftId));
    }
  }

  if (isRecord(saved.organization)) document.organization = saved.organization;
  else if ('organization' in saved) discarded = true;

  const departments = document.departments ?? [];
  const active = saved.activeDepartmentId;
  if (typeof active === 'string' && departments.some((d) => d.id === active)) document.activeDepartmentId = active;
  else if ('departments' in document) document.activeDepartmentId = departments[0]?.id ?? null;

  return { document, discarded };
}
