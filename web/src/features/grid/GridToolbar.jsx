import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Copy, Filter, Redo2, Search, Share2, Sparkles, Trash2, Undo2 } from 'lucide-react';
import { useScheduleStore } from '../../store/useScheduleStore.js';
import { selectActiveDepartment, selectDepartmentEmployees, selectDepartmentShifts } from '../../store/selectors.js';
import { ExportModal } from '../export/ExportModal.jsx';
import { Modal, btnDanger, btnPrimary, btnSecondary } from '../team/Modal.jsx';
import { DEFAULT_FILTERS, OFF_FILTER, shiftLabel } from './gridUtils.js';

const iconBtn =
  'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-40';
const fieldCls =
  'h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-emerald-600';

const isTypingTarget = (el) =>
  el instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);

/**
 * Barra de ferramentas da grade: gerar escala, desfazer/refazer, duplicar/limpar semana,
 * busca, filtros e exportação.
 * @param {{ filters: { query: string, shiftId: string, tag: string, onlyAlerts: boolean }, onFiltersChange: (next: any) => void }} props
 */
export function GridToolbar({ filters, onFiltersChange }) {
  const department = useScheduleStore(selectActiveDepartment);
  const employees = useScheduleStore(selectDepartmentEmployees);
  const shifts = useScheduleStore(selectDepartmentShifts);
  const weekStart = useScheduleStore((s) => s.currentWeekStart);
  const canUndo = useScheduleStore((s) => s.canUndo);
  const canRedo = useScheduleStore((s) => s.canRedo);
  const undo = useScheduleStore((s) => s.undo);
  const redo = useScheduleStore((s) => s.redo);
  const generateWeek = useScheduleStore((s) => s.generateWeek);
  const duplicatePreviousWeek = useScheduleStore((s) => s.duplicatePreviousWeek);
  const clearWeek = useScheduleStore((s) => s.clearWeek);

  const [feedback, setFeedback] = useState(null); // { key, red, yellow }
  const [confirmClear, setConfirmClear] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const tags = useMemo(() => [...new Set(employees.flatMap((e) => e.tags ?? []))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [employees]);
  const feedbackKey = `${department?.id}|${weekStart}`;

  // Atalhos globais: Ctrl+Z desfaz; Ctrl+Y e Ctrl+Shift+Z refazem. Ignorados em campos de texto.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || isTypingTarget(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  const generate = () => {
    const result = generateWeek();
    if (result) setFeedback({ key: feedbackKey, red: result.summary.red, yellow: result.summary.yellow });
  };

  const set = (patch) => onFiltersChange({ ...filters, ...patch });
  const hasFilters = filters.query || filters.shiftId || filters.tag || filters.onlyAlerts;
  const shown = feedback && feedback.key === feedbackKey ? feedback : null;
  const totalAlerts = shown ? shown.red + shown.yellow : 0;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={`${btnPrimary} h-9`} onClick={generate}>
          <Sparkles size={16} aria-hidden="true" />
          Gerar Escala Inteligente
        </button>

        <div className="flex gap-1" role="group" aria-label="Histórico">
          <button type="button" className={iconBtn} onClick={undo} disabled={!canUndo} aria-label="Desfazer" title="Desfazer (Ctrl+Z)">
            <Undo2 size={16} aria-hidden="true" />
          </button>
          <button type="button" className={iconBtn} onClick={redo} disabled={!canRedo} aria-label="Refazer" title="Refazer (Ctrl+Y)">
            <Redo2 size={16} aria-hidden="true" />
          </button>
        </div>

        <button type="button" className={`${btnSecondary} h-9`} onClick={duplicatePreviousWeek}>
          <Copy size={16} aria-hidden="true" />
          Duplicar semana anterior
        </button>
        <button type="button" className={`${btnSecondary} h-9`} onClick={() => setConfirmClear(true)}>
          <Trash2 size={16} aria-hidden="true" />
          Limpar semana
        </button>

        <button type="button" className={`${btnSecondary} ml-auto h-9`} onClick={() => setExportOpen(true)}>
          <Share2 size={16} aria-hidden="true" />
          Exportar / WhatsApp
        </button>
      </div>

      {shown && (
        <p
          role="status"
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium ${
            totalAlerts === 0 ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : shown.red ? 'border-rose-300 bg-rose-50 text-rose-900' : 'border-amber-400 bg-amber-50 text-amber-900'
          }`}
        >
          <CalendarClock size={16} aria-hidden="true" />
          {totalAlerts === 0
            ? 'Escala 100% dentro da CLT'
            : `Escala gerada com ${totalAlerts} alerta${totalAlerts > 1 ? 's' : ''} (${shown.red} vermelho${shown.red === 1 ? '' : 's'}, ${shown.yellow} amarelo${shown.yellow === 1 ? '' : 's'})`}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[11rem] flex-1 sm:max-w-xs">
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
        <select aria-label="Filtrar por turno" value={filters.shiftId} onChange={(e) => set({ shiftId: e.target.value })} className={fieldCls}>
          <option value="">Todos os turnos</option>
          {shifts.map((s) => (
            <option key={s.id} value={s.id}>
              {shiftLabel(s)} {s.code ? s.name : ''} {s.startTime}–{s.endTime}
            </option>
          ))}
          <option value={OFF_FILTER}>Folga</option>
        </select>
        <select aria-label="Filtrar por tag" value={filters.tag} onChange={(e) => set({ tag: e.target.value })} className={fieldCls}>
          <option value="">Todas as tags</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
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
        {hasFilters && (
          <button type="button" onClick={() => onFiltersChange(DEFAULT_FILTERS)} className="h-9 rounded-lg px-2 text-sm font-medium text-slate-700 underline hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-emerald-600">
            Limpar filtros
          </button>
        )}
      </div>

      {confirmClear && (
        <Modal
          title="Limpar semana?"
          onClose={() => setConfirmClear(false)}
          footer={
            <>
              <button type="button" className={btnSecondary} onClick={() => setConfirmClear(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className={btnDanger}
                onClick={() => {
                  clearWeek();
                  setFeedback(null);
                  setConfirmClear(false);
                }}
              >
                Confirmar limpeza
              </button>
            </>
          }
        >
          <p className="text-sm text-slate-700">Todas as células da semana atual deste setor serão apagadas, inclusive as travadas. Você pode desfazer com Ctrl+Z.</p>
        </Modal>
      )}
      {exportOpen && <ExportModal onClose={() => setExportOpen(false)} />}
    </div>
  );
}
