import { useMemo } from 'react';
import { CircleCheck, OctagonAlert, TriangleAlert } from 'lucide-react';
import { addDays } from '@escala/shared/utils/dateUtils.js';
import { DAY_SHORT, formatDM } from './gridUtils.js';

const SEAL = {
  GREEN: { title: 'Mês dentro da CLT', hint: 'Nenhum alerta neste mês.', cls: 'border-emerald-600 bg-emerald-50 text-emerald-900', Icon: CircleCheck },
  YELLOW: { title: 'Atenção no mês', hint: 'Alertas operacionais ou sindicais.', cls: 'border-amber-500 bg-amber-50 text-amber-900', Icon: TriangleAlert },
  RED: { title: 'Infrações CLT no mês', hint: 'Há violações que precisam de correção.', cls: 'border-rose-600 bg-rose-50 text-rose-900', Icon: OctagonAlert },
};

const bySeverity = (a, b) => (a.severity === b.severity ? 0 : a.severity === 'RED' ? -1 : 1);

/** Agrupa os alertas de uma semana por pessoa e, para cobertura (sem pessoa), por dia. */
function groupWeek(issues, nameOf, weekStart) {
  const byKey = new Map();
  for (const issue of issues) {
    const key = issue.employeeId ?? `day:${issue.date}`;
    if (!byKey.has(key)) {
      const dayIndex = issue.date ? Math.max(0, [0, 1, 2, 3, 4, 5, 6].findIndex((n) => addDays(weekStart, n) === issue.date)) : 0;
      byKey.set(key, {
        key,
        employeeId: issue.employeeId,
        label: issue.employeeId ? (nameOf.get(issue.employeeId) ?? 'Funcionário') : `Cobertura de ${DAY_SHORT[dayIndex]} ${formatDM(issue.date)}`,
        items: [],
      });
    }
    byKey.get(key).items.push(issue);
  }
  const groups = [...byKey.values()];
  for (const g of groups) g.items.sort(bySeverity);
  return groups.sort((a, b) => (a.employeeId ? 0 : 1) - (b.employeeId ? 0 : 1) || a.label.localeCompare(b.label, 'pt-BR'));
}

/**
 * Resumo do mês: selo com a contagem de vermelhos e amarelos e a lista de alertas agrupada por semana e por pessoa/dia.
 * @param {{ data: ReturnType<import('./useMonthData.js').useMonthData>, onFocusCell: (target: { employeeId: string, date: string | null }) => void }} props
 */
export function MonthPanel({ data, onFocusCell }) {
  const { validation, employees, issues } = data;
  const nameOf = useMemo(() => new Map(employees.map((e) => [e.id, e.name])), [employees]);
  const weekGroups = useMemo(
    () => issues.weekGroups.map((w) => ({ weekStart: w.weekStart, groups: groupWeek(w.issues, nameOf, w.weekStart) })).filter((w) => w.groups.length),
    [issues, nameOf],
  );
  if (!validation) return null;
  const { status, red, yellow } = validation.summary;
  const seal = SEAL[status];

  return (
    <section aria-label="Resumo do mês" className="flex min-w-0 flex-col gap-3 text-sm">
      <div data-testid="month-seal" data-status={status} role="status" className={`flex items-center gap-3 rounded-xl border-2 p-3 ${seal.cls}`}>
        <seal.Icon size={32} aria-hidden="true" className="shrink-0" />
        <div className="min-w-0">
          <p className="text-base font-bold leading-tight">{seal.title}</p>
          <p className="text-xs">
            {red} vermelho{red === 1 ? '' : 's'} · {yellow} amarelo{yellow === 1 ? '' : 's'}
          </p>
          <p className="text-xs">{seal.hint}</p>
        </div>
      </div>

      {weekGroups.map(({ weekStart, groups }) => (
        <div key={weekStart}>
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-700">
            Semana {formatDM(weekStart)} – {formatDM(addDays(weekStart, 6))}
          </h3>
          <ul className="flex flex-col gap-2">
            {groups.map((group) => (
              <li key={group.key} className="rounded-lg border border-slate-200 bg-white p-2">
                <p className="mb-1 text-xs font-semibold text-slate-900">{group.label}</p>
                <ul className="flex flex-col gap-1">
                  {group.items.map((issue, i) => {
                    const isRed = issue.severity === 'RED';
                    const Icon = isRed ? OctagonAlert : TriangleAlert;
                    const body = (
                      <>
                        <Icon size={14} aria-hidden="true" className={`mt-px shrink-0 ${isRed ? 'text-rose-700' : 'text-amber-700'}`} />
                        <span>
                          <span className="sr-only">{isRed ? 'Vermelho: ' : 'Amarelo: '}</span>
                          {issue.date && <span className="mr-1 font-semibold tabular-nums">{formatDM(issue.date)}</span>}
                          {issue.message}
                        </span>
                      </>
                    );
                    return (
                      <li key={`${issue.code}-${issue.date}-${i}`}>
                        {issue.employeeId ? (
                          <button
                            type="button"
                            onClick={() => onFocusCell({ employeeId: issue.employeeId, date: issue.date ?? weekStart })}
                            className="flex w-full items-start gap-1.5 rounded-md px-1.5 py-1 text-left text-xs text-slate-800 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-600"
                          >
                            {body}
                          </button>
                        ) : (
                          <p className="flex items-start gap-1.5 px-1.5 py-1 text-xs text-slate-800">{body}</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
