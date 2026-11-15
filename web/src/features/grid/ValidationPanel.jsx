import { useMemo } from 'react';
import { CircleCheck, OctagonAlert, TriangleAlert } from 'lucide-react';
import { SEVERITY } from '@escala/shared/utils/cltValidator.js';
import { useScheduleStore } from '../../store/useScheduleStore.js';
import { selectDepartmentEmployees, selectWeekValidation } from '../../store/selectors.js';
import { DAY_SHORT, formatDM, getWeekDates } from './gridUtils.js';

const SEAL = {
  GREEN: { title: 'Dentro da CLT', hint: 'Nenhum alerta nesta semana.', cls: 'border-emerald-600 bg-emerald-50 text-emerald-900', Icon: CircleCheck },
  YELLOW: { title: 'Atenção', hint: 'Alertas operacionais ou sindicais.', cls: 'border-amber-500 bg-amber-50 text-amber-900', Icon: TriangleAlert },
  RED: { title: 'Infrações CLT', hint: 'Há violações que precisam de correção.', cls: 'border-rose-600 bg-rose-50 text-rose-900', Icon: OctagonAlert },
};

/**
 * Painel do Semáforo CLT da semana: selo com contagens e alertas agrupados por gravidade e pessoa/dia.
 * @param {{ onFocusCell: (target: { employeeId: string, date: string | null }) => void, onShowCoverage?: () => void }} props
 */
export function ValidationPanel({ onFocusCell, onShowCoverage }) {
  const validation = useScheduleStore(selectWeekValidation);
  const employees = useScheduleStore(selectDepartmentEmployees);
  const weekStart = useScheduleStore((s) => s.currentWeekStart);
  const dates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const nameOf = useMemo(() => new Map(employees.map((e) => [e.id, e.name])), [employees]);

  const groups = useMemo(() => {
    const result = { RED: [], YELLOW: [] };
    if (!validation) return result;
    for (const severity of [SEVERITY.RED, SEVERITY.YELLOW]) {
      const byKey = new Map();
      for (const issue of validation.issues) {
        if (issue.severity !== severity) continue;
        const key = issue.employeeId ?? `day:${issue.date}`;
        if (!byKey.has(key)) {
          byKey.set(key, {
            key,
            employeeId: issue.employeeId,
            label: issue.employeeId ? (nameOf.get(issue.employeeId) ?? 'Funcionário') : `Cobertura de ${DAY_SHORT[Math.max(0, dates.indexOf(issue.date))]} ${formatDM(issue.date)}`,
            items: [],
          });
        }
        byKey.get(key).items.push(issue);
      }
      result[severity] = [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
    }
    return result;
  }, [validation, nameOf, dates]);

  if (!validation) return null;
  const { status, summary } = validation;
  const seal = SEAL[status];

  return (
    <section aria-label="Semáforo CLT" className="flex min-w-0 flex-col gap-3 text-sm">
      <div
        data-testid="clt-seal"
        data-status={status}
        role="status"
        className={`flex items-center gap-3 rounded-xl border-2 p-3 ${seal.cls}`}
      >
        <seal.Icon size={32} aria-hidden="true" className="shrink-0" />
        <div className="min-w-0">
          <p className="text-base font-bold leading-tight">{seal.title}</p>
          <p className="text-xs">
            {summary.red} vermelho{summary.red === 1 ? '' : 's'} · {summary.yellow} amarelo{summary.yellow === 1 ? '' : 's'}
          </p>
          <p className="text-xs">{seal.hint}</p>
        </div>
      </div>

      {[SEVERITY.RED, SEVERITY.YELLOW].map((severity) => {
        const list = groups[severity];
        if (!list.length) return null;
        const red = severity === SEVERITY.RED;
        const Icon = red ? OctagonAlert : TriangleAlert;
        return (
          <div key={severity}>
            <h3 className={`mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide ${red ? 'text-rose-700' : 'text-amber-800'}`}>
              <Icon size={16} aria-hidden="true" />
              {red ? 'Vermelhos (infrações)' : 'Amarelos (atenção)'}
            </h3>
            <ul className="flex flex-col gap-2">
              {list.map((group) => (
                <li key={group.key} className={`rounded-lg border bg-white p-2 ${red ? 'border-rose-200' : 'border-amber-300'}`}>
                  <p className="mb-1 text-xs font-semibold text-slate-900">{group.label}</p>
                  <ul className="flex flex-col gap-1">
                    {group.items.map((issue, i) => (
                      <li key={`${issue.code}-${issue.date}-${i}`}>
                        <button
                          type="button"
                          onClick={() => (issue.employeeId ? onFocusCell({ employeeId: issue.employeeId, date: issue.date }) : onShowCoverage?.())}
                          className="w-full rounded-md px-1.5 py-1 text-left text-xs text-slate-800 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-600"
                        >
                          {issue.date && <span className="mr-1 font-semibold tabular-nums">{formatDM(issue.date)}</span>}
                          {issue.message}
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
