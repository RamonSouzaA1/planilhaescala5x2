import { useState } from 'react';
import { CalendarClock, Filter, Redo2, Search, SlidersHorizontal, Sparkles, Trash2, Undo2, User, Users } from 'lucide-react';
import { useScheduleStore } from '../../store/useScheduleStore.js';
import { btnPrimary, btnSecondary } from '../team/Modal.jsx';
import { MoreActionsMenu, fieldCls, iconBtn, useHistoryShortcuts, useIsMobile } from './GridToolbar.jsx';
import { SegmentedControl } from './SegmentedControl.jsx';
import { DEFAULT_FILTERS } from './gridUtils.js';

const VIEW_OPTIONS = [
  { value: 'team', label: 'Equipe', Icon: Users },
  { value: 'person', label: 'Por pessoa', Icon: User },
];

/**
 * Barra de ferramentas do mês: Gerar mês, desfazer/refazer, limpar mês, visão (Equipe / Por pessoa),
 * busca e "só com alertas". As confirmações ficam no pai (`onGenerate` e `onClear` só as pedem).
 * @param {{
 *   filters: { query: string, onlyAlerts: boolean },
 *   onFiltersChange: (next: any) => void,
 *   view: 'team' | 'person', onViewChange: (view: string) => void,
 *   feedback: { red: number, yellow: number } | null,
 *   onGenerate: () => void, onClear: () => void,
 * }} props
 */
export function MonthToolbar({ filters, onFiltersChange, view, onViewChange, feedback, onGenerate, onClear }) {
  const canUndo = useScheduleStore((s) => s.canUndo);
  const canRedo = useScheduleStore((s) => s.canRedo);
  const undo = useScheduleStore((s) => s.undo);
  const redo = useScheduleStore((s) => s.redo);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const isMobile = useIsMobile();
  useHistoryShortcuts();

  const set = (patch) => onFiltersChange({ ...filters, ...patch });
  const hasFilters = filters.query || filters.onlyAlerts;
  const total = feedback ? feedback.red + feedback.yellow : 0;
  const onlyAlertsBtn = (
    <button
      type="button"
      aria-pressed={filters.onlyAlerts}
      onClick={() => set({ onlyAlerts: !filters.onlyAlerts })}
      className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
        filters.onlyAlerts ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      <Filter size={16} aria-hidden="true" />
      Só com alertas
    </button>
  );

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
      <div className="flex items-center gap-2 sm:flex-wrap">
        <button type="button" className={`${btnPrimary} h-9 ${isMobile ? 'min-w-0 flex-1 px-2' : ''}`} onClick={onGenerate}>
          <Sparkles size={16} aria-hidden="true" />
          <span className={isMobile ? 'truncate' : ''}>Gerar mês</span>
        </button>

        <div className="flex gap-1" role="group" aria-label="Histórico">
          <button type="button" className={iconBtn} onClick={undo} disabled={!canUndo} aria-label="Desfazer" title="Desfazer (Ctrl+Z)">
            <Undo2 size={16} aria-hidden="true" />
          </button>
          <button type="button" className={iconBtn} onClick={redo} disabled={!canRedo} aria-label="Refazer" title="Refazer (Ctrl+Y)">
            <Redo2 size={16} aria-hidden="true" />
          </button>
        </div>

        {isMobile ? (
          <MoreActionsMenu actions={[{ label: 'Limpar mês', Icon: Trash2, onSelect: onClear }]} />
        ) : (
          <button type="button" className={`${btnSecondary} h-9`} onClick={onClear}>
            <Trash2 size={16} aria-hidden="true" />
            Limpar mês
          </button>
        )}

        {!isMobile && (
          <div className="ml-auto">
            <SegmentedControl label="Visão do mês" value={view} options={VIEW_OPTIONS} onChange={onViewChange} />
          </div>
        )}
      </div>

      {isMobile && <SegmentedControl label="Visão do mês" value={view} options={VIEW_OPTIONS} onChange={onViewChange} />}

      {feedback && (
        <p
          role="status"
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium ${
            total === 0 ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : feedback.red ? 'border-rose-300 bg-rose-50 text-rose-900' : 'border-amber-400 bg-amber-50 text-amber-900'
          }`}
        >
          <CalendarClock size={16} aria-hidden="true" />
          {total === 0
            ? 'Mês 100% dentro da CLT'
            : `Mês gerado com ${total} alerta${total > 1 ? 's' : ''} (${feedback.red} vermelho${feedback.red === 1 ? '' : 's'}, ${feedback.yellow} amarelo${feedback.yellow === 1 ? '' : 's'})`}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:min-w-[11rem] sm:max-w-xs">
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-2.5 text-slate-500" />
          <input
            type="search"
            aria-label="Buscar por nome"
            placeholder="Buscar por nome"
            value={filters.query}
            onChange={(e) => set({ query: e.target.value })}
            className={`${fieldCls} w-full pl-8 placeholder:text-slate-500`}
          />
        </div>
        {isMobile && (
          <button
            type="button"
            aria-expanded={filtersOpen}
            aria-controls="month-filters-panel"
            onClick={() => setFiltersOpen((o) => !o)}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
              filters.onlyAlerts ? 'border-emerald-700 bg-emerald-50 text-emerald-900' : 'border-slate-300 bg-white text-slate-700'
            }`}
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            Filtros
            {filters.onlyAlerts && (
              <span aria-label="1 filtro ativo" className="rounded-full bg-emerald-700 px-1.5 text-xs font-bold text-white">
                1
              </span>
            )}
          </button>
        )}
        {(!isMobile || filtersOpen) && (
          <div id="month-filters-panel" className={isMobile ? 'flex w-full flex-wrap items-center gap-2' : 'contents'}>
            {onlyAlertsBtn}
          </div>
        )}
        {hasFilters && (
          <button type="button" onClick={() => onFiltersChange(DEFAULT_FILTERS)} className="h-9 rounded-lg px-2 text-sm font-medium text-slate-700 underline hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-emerald-600">
            Limpar filtros
          </button>
        )}
      </div>
    </div>
  );
}
