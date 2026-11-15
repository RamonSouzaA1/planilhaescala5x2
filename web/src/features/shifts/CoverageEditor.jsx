import { useMemo, useState } from 'react';
import { AlertTriangle, Copy, Plus, Trash2, X } from 'lucide-react';
import { DAYS_OF_WEEK } from '@escala/shared/models/schemas.js';
import { useScheduleStore } from '../../store/useScheduleStore.js';
import { selectActiveDepartment } from '../../store/selectors.js';
import { isValidTime } from './shiftMetrics.js';
import { btnGhost, btnIcon, card, errorCls, hintCls } from './ui.js';

const DAY_NAMES = { SEG: 'segunda', TER: 'terça', QUA: 'quarta', QUI: 'quinta', SEX: 'sexta', SAB: 'sábado', DOM: 'domingo' };
const small = 'w-full rounded-md border border-slate-300 bg-white px-1.5 py-1 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/30';
const addBtn =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2';

/** Regra de um dia como dados "limpos" (sem id), para copiar entre dias. */
function ruleData(rule) {
  return {
    minTotalStaff: rule?.minTotalStaff ?? 0,
    requiredTags: (rule?.requiredTags ?? []).map((t) => ({ ...t })),
    peakHours: (rule?.peakHours ?? []).map((p) => ({ ...p })),
  };
}

/** Linha da tabela para um dia: mínimo, tags e picos. */
function DayRow({ day, rule, activeCount, onSave, onClear }) {
  const [tag, setTag] = useState('');
  const [tagMin, setTagMin] = useState('1');
  const [peak, setPeak] = useState({ start: '', end: '', min: '1' });
  const [error, setError] = useState('');
  const data = ruleData(rule);
  const name = DAY_NAMES[day];
  const errId = `cov-${day}-error`;
  const tooMany = activeCount > 0 ? data.minTotalStaff > activeCount : data.minTotalStaff > 0;

  const addTag = () => {
    const t = tag.trim();
    const n = Number(tagMin);
    if (!t) return setError('Informe o nome da tag.');
    if (!Number.isInteger(n) || n < 1) return setError('O mínimo da tag deve ser 1 ou mais.');
    const others = data.requiredTags.filter((x) => x.tag.toLowerCase() !== t.toLowerCase());
    onSave({ ...data, requiredTags: [...others, { tag: t, minCount: n }] });
    setTag('');
    setTagMin('1');
    setError('');
  };

  const addPeak = () => {
    const n = Number(peak.min);
    if (!isValidTime(peak.start) || !isValidTime(peak.end)) return setError('Informe início e fim do pico.');
    if (peak.start === peak.end) return setError('Início e fim do pico não podem ser iguais.');
    if (!Number.isInteger(n) || n < 1) return setError('O mínimo do pico deve ser 1 ou mais.');
    onSave({ ...data, peakHours: [...data.peakHours, { start: peak.start, end: peak.end, minStaff: n }] });
    setPeak({ start: '', end: '', min: '1' });
    setError('');
  };

  return (
    <tr className={tooMany ? 'bg-amber-50' : 'bg-white'}>
      <th scope="row" className="whitespace-nowrap border-b border-slate-200 px-2 py-2 text-left align-top text-sm font-semibold text-slate-900">
        {day}
      </th>
      <td className="border-b border-slate-200 px-2 py-2 align-top">
        <label htmlFor={`cov-${day}-min`} className="sr-only">
          Mínimo de pessoas na {name}
        </label>
        <input
          id={`cov-${day}-min`}
          type="number"
          min="0"
          inputMode="numeric"
          className={`${small} w-16`}
          data-cov-col="min"
          data-cov-day={day}
          value={rule ? data.minTotalStaff : ''}
          placeholder="0"
          aria-describedby={tooMany ? `cov-${day}-warn` : undefined}
          onChange={(e) => {
            const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
            onSave({ ...data, minTotalStaff: n });
          }}
        />
        {tooMany && (
          <p id={`cov-${day}-warn`} className="mt-1 text-xs text-amber-800">
            Maior que a equipe ativa ({activeCount})
          </p>
        )}
      </td>
      <td className="border-b border-slate-200 px-2 py-2 align-top">
        <ul className="mb-1 flex flex-wrap gap-1" aria-label={`Tags obrigatórias na ${name}`}>
          {data.requiredTags.map((t) => (
            <li key={t.tag} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-2 pr-1 text-xs text-slate-800">
              {t.tag} ≥ {t.minCount}
              <button
                type="button"
                className="inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                aria-label={`Remover tag ${t.tag} da ${name}`}
                onClick={() => onSave({ ...data, requiredTags: data.requiredTags.filter((x) => x.tag !== t.tag) })}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-1">
          <label htmlFor={`cov-${day}-tag`} className="sr-only">
            Nova tag obrigatória na {name}
          </label>
          <input
            id={`cov-${day}-tag`}
            className={`${small} min-w-24`}
            list="cov-tag-suggestions"
            placeholder="Tag (ex.: Líder)"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            aria-describedby={error ? errId : undefined}
          />
          <label htmlFor={`cov-${day}-tagmin`} className="sr-only">
            Mínimo da tag na {name}
          </label>
          <input id={`cov-${day}-tagmin`} type="number" min="1" className={`${small} w-14`} value={tagMin} onChange={(e) => setTagMin(e.target.value)} />
          <button type="button" className={addBtn} aria-label={`Adicionar tag obrigatória na ${name}`} onClick={addTag}>
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>
      </td>
      <td className="border-b border-slate-200 px-2 py-2 align-top">
        <ul className="mb-1 flex flex-wrap gap-1" aria-label={`Picos de horário na ${name}`}>
          {data.peakHours.map((p, i) => (
            <li key={`${p.start}-${p.end}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-2 pr-1 text-xs text-slate-800">
              {p.start}–{p.end} ≥ {p.minStaff}
              {p.end <= p.start ? ' (vira o dia)' : ''}
              <button
                type="button"
                className="inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                aria-label={`Remover pico ${p.start} às ${p.end} da ${name}`}
                onClick={() => onSave({ ...data, peakHours: data.peakHours.filter((_, j) => j !== i) })}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-1">
          <label htmlFor={`cov-${day}-pstart`} className="sr-only">
            Início do pico na {name}
          </label>
          <input id={`cov-${day}-pstart`} type="time" className={`${small} w-24`} value={peak.start} onChange={(e) => setPeak((p) => ({ ...p, start: e.target.value }))} />
          <label htmlFor={`cov-${day}-pend`} className="sr-only">
            Fim do pico na {name}
          </label>
          <input id={`cov-${day}-pend`} type="time" className={`${small} w-24`} value={peak.end} onChange={(e) => setPeak((p) => ({ ...p, end: e.target.value }))} />
          <label htmlFor={`cov-${day}-pmin`} className="sr-only">
            Mínimo no pico na {name}
          </label>
          <input id={`cov-${day}-pmin`} type="number" min="1" className={`${small} w-14`} value={peak.min} onChange={(e) => setPeak((p) => ({ ...p, min: e.target.value }))} />
          <button type="button" className={addBtn} aria-label={`Adicionar pico de horário na ${name}`} onClick={addPeak}>
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>
        {error && (
          <p id={errId} role="alert" className={errorCls}>
            {error}
          </p>
        )}
      </td>
      <td className="border-b border-slate-200 px-2 py-2 align-top">
        <button type="button" className={btnIcon} aria-label={`Limpar meta da ${name}`} disabled={!rule} onClick={() => onClear(rule)}>
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </td>
    </tr>
  );
}

/**
 * Metas de cobertura por dia da semana (SEG..DOM) em tabela compacta.
 * Sem props: usa o store. Setas para cima/baixo navegam entre os campos de mínimo.
 */
export function CoverageEditor() {
  const department = useScheduleStore(selectActiveDepartment);
  // Seleciona os arrays crus e filtra aqui: os seletores de lista do store compartilham um único
  // memoize-last e, usados juntos num mesmo componente, devolvem arrays novos a cada leitura (loop infinito).
  const allRules = useScheduleStore((s) => s.coverageRules);
  const allEmployees = useScheduleStore((s) => s.employees);
  const departmentId = department?.id;
  const rules = useMemo(() => allRules.filter((r) => r.departmentId === departmentId), [allRules, departmentId]);
  const team = useMemo(() => allEmployees.filter((e) => e.departmentId === departmentId), [allEmployees, departmentId]);
  const active = useMemo(() => team.filter((e) => e.status === 'ACTIVE'), [team]);
  const upsertCoverageRule = useScheduleStore((s) => s.upsertCoverageRule);
  const removeCoverageRule = useScheduleStore((s) => s.removeCoverageRule);
  const [shortcutMsg, setShortcutMsg] = useState('');

  const tagSuggestions = useMemo(() => [...new Set(team.flatMap((e) => e.tags ?? []))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [team]);

  if (!department) {
    return (
      <section aria-labelledby="cov-title" className={`${card} p-4 text-sm text-slate-600`}>
        <h2 id="cov-title" className="text-base font-semibold text-slate-900">
          Cobertura
        </h2>
        <p className="mt-2">Crie um setor para definir metas de cobertura.</p>
      </section>
    );
  }

  const byDay = new Map(rules.map((r) => [r.dayOfWeek, r]));
  const activeCount = active.length;
  const totalRequired = DAYS_OF_WEEK.reduce((sum, d) => sum + (byDay.get(d)?.minTotalStaff ?? 0), 0);
  const capacityDays = 5 * activeCount;
  const perDay = Math.round(((5 / 7) * activeCount) * 10) / 10;
  const impossible = totalRequired > capacityDays;

  const save = (day) => (data) => upsertCoverageRule({ dayOfWeek: day, ...data });
  const mondayRule = byDay.get('SEG');

  const copyMonday = (targets, label) => {
    if (!mondayRule) return setShortcutMsg('Defina a meta de segunda-feira antes de copiar.');
    const data = ruleData(mondayRule);
    for (const d of targets) upsertCoverageRule({ dayOfWeek: d, ...ruleData(data) });
    setShortcutMsg(`Meta de segunda copiada para ${label}.`);
  };

  const onKeyDown = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const target = e.target;
    if (!(target instanceof HTMLInputElement) || target.dataset.covCol !== 'min') return;
    const i = DAYS_OF_WEEK.indexOf(target.dataset.covDay);
    const next = DAYS_OF_WEEK[i + (e.key === 'ArrowDown' ? 1 : -1)];
    if (!next) return;
    e.preventDefault();
    document.getElementById(`cov-${next}-min`)?.focus();
  };

  return (
    <section aria-labelledby="cov-title" className={`${card} p-4 text-sm text-slate-900`}>
      <h2 id="cov-title" className="text-base font-semibold text-slate-900">
        Metas de cobertura de {department.name}
      </h2>

      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className={btnGhost} onClick={() => copyMonday(['TER', 'QUA'], 'terça e quarta')}>
          <Copy size={16} aria-hidden="true" />
          Copiar segunda para terça e quarta
        </button>
        <button type="button" className={btnGhost} onClick={() => copyMonday(DAYS_OF_WEEK.filter((d) => d !== 'SEG'), 'todos os dias')}>
          <Copy size={16} aria-hidden="true" />
          Aplicar a todos os dias
        </button>
      </div>
      <p role="status" className={hintCls}>
        {shortcutMsg}
      </p>

      <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[44rem] border-collapse text-sm" onKeyDown={onKeyDown}>
          <caption className="sr-only">Metas de cobertura por dia da semana. Use as setas para cima e para baixo nos campos de mínimo para trocar de dia.</caption>
          <thead className="bg-slate-50 text-left text-xs font-medium text-slate-700">
            <tr>
              <th scope="col" className="px-2 py-2">Dia</th>
              <th scope="col" className="px-2 py-2">Mín. pessoas</th>
              <th scope="col" className="px-2 py-2">Tags obrigatórias</th>
              <th scope="col" className="px-2 py-2">Picos de horário (início, fim, mín.)</th>
              <th scope="col" className="px-2 py-2"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {DAYS_OF_WEEK.map((day) => (
              <DayRow
                key={day}
                day={day}
                rule={byDay.get(day)}
                activeCount={activeCount}
                onSave={save(day)}
                onClear={(rule) => removeCoverageRule(rule.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <datalist id="cov-tag-suggestions">
        {tagSuggestions.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      <div className="mt-3 space-y-1" aria-live="polite">
        <p className="text-slate-700">
          Capacidade disponível: ≈ {String(perDay).replace('.', ',')} pessoas por dia (5/7 × {activeCount} ativos). Exigido na semana: {totalRequired} pessoas-dia de {capacityDays} possíveis (5 × {activeCount}).
        </p>
        {impossible && (
          <p role="alert" className="flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 p-2 font-medium text-amber-900">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            Meta impossível: as metas somam {totalRequired} pessoas-dia, mas {activeCount} {activeCount === 1 ? 'pessoa ativa entrega' : 'pessoas ativas entregam'} no máximo {capacityDays} (5 dias cada). Reduza as metas ou contrate.
          </p>
        )}
      </div>
    </section>
  );
}
