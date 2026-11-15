import { useMemo } from 'react';
import { computeHourlyCoverage } from '@escala/shared/utils/cltValidator.js';
import { DAY_SHORT, formatDM } from './gridUtils.js';

const pad = (h) => `${String(h).padStart(2, '0')}h`;

/**
 * Heatmap "Cobertura por hora": 7 dias x 24 horas, com intensidade de cor e o número de pessoas.
 * Em telas estreitas a tabela rola na horizontal.
 * @param {{ dates: string[], assignments: any[], shifts: any[] }} props
 *   `assignments` deve incluir o domingo anterior à semana (turnos noturnos que viram a meia-noite).
 */
export function CoverageHeatmap({ dates, assignments, shifts }) {
  const { rows, max } = useMemo(() => {
    const rows = dates.map((date) => computeHourlyCoverage({ assignments, shifts, date }));
    return { rows, max: Math.max(1, ...rows.flat()) };
  }, [dates, assignments, shifts]);

  return (
    <section aria-label="Cobertura por hora" className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
        <h3 className="text-sm font-semibold text-slate-900">Cobertura por hora</h3>
        <p className="flex items-center gap-1.5 text-xs text-slate-600">
          Pessoas na loja: menos
          {[0.1, 0.3, 0.5, 0.7].map((a) => (
            <span key={a} aria-hidden="true" className="h-3 w-5 rounded-sm border border-slate-200" style={{ backgroundColor: `rgba(16,185,129,${a})` }} />
          ))}
          mais
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] border-collapse text-center text-xs">
          <caption className="sr-only">Número de pessoas trabalhando em cada hora, por dia da semana</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-white px-2 py-1.5 text-left font-medium text-slate-700">
                Dia
              </th>
              {Array.from({ length: 24 }, (_, h) => (
                <th key={h} scope="col" className="px-0.5 py-1.5 font-medium text-slate-700">
                  {pad(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dates.map((date, d) => (
              <tr key={date}>
                <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-white px-2 py-1 text-left font-medium text-slate-800">
                  {DAY_SHORT[d]} {formatDM(date)}
                </th>
                {rows[d].map((count, h) => (
                  <td
                    key={h}
                    aria-label={`${pad(h)}: ${count}`}
                    title={`${DAY_SHORT[d]} ${formatDM(date)}, ${pad(h)}: ${count} pessoa${count === 1 ? '' : 's'}`}
                    className={`border border-white px-0.5 py-1.5 font-medium tabular-nums ${count === 0 ? 'bg-slate-50 text-slate-600' : 'text-slate-900'}`}
                    style={count ? { backgroundColor: `rgba(16,185,129,${(0.1 + 0.65 * (count / max)).toFixed(2)})` } : undefined}
                  >
                    {count}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
