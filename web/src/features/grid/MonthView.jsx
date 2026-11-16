import { useCallback, useState } from 'react';
import { CalendarX2, OctagonAlert, ShieldCheck, Sparkles, TriangleAlert, Users } from 'lucide-react';
import { useScheduleStore } from '../../store/useScheduleStore.js';
import { Modal, btnPrimary, cardCls } from '../team/Modal.jsx';
import { useIsMobile } from './GridToolbar.jsx';
import { ClearMonthDialog, GenerateMonthDialog } from './MonthDialogs.jsx';
import { MonthPanel } from './MonthPanel.jsx';
import { MonthPersonView } from './MonthPersonView.jsx';
import { MonthTeamMatrix } from './MonthTeamMatrix.jsx';
import { MonthToolbar } from './MonthToolbar.jsx';
import { DEFAULT_FILTERS } from './gridUtils.js';
import { formatMonthLabel } from './monthUtils.js';
import { useFilteredEmployees, useMonthData } from './useMonthData.js';

/**
 * Modo Mês da aba Escala: barra de ferramentas, visão Equipe (matriz funcionários x dias) ou Por pessoa
 * (calendário) e o resumo do mês (ao lado em telas largas, gaveta no celular).
 */
export function MonthView() {
  const data = useMonthData();
  const { department, employees, cells, validation, weeks, monthKey, issues } = data;
  const generateMonth = useScheduleStore((s) => s.generateMonth);
  const clearMonth = useScheduleStore((s) => s.clearMonth);
  const isMobile = useIsMobile();

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [viewChoice, setViewChoice] = useState(null);
  const [personId, setPersonId] = useState(null);
  const [focusTarget, setFocusTarget] = useState(null);
  const [confirm, setConfirm] = useState(null); // 'generate' | 'clear' | null
  const [feedback, setFeedback] = useState(null); // { key, red, yellow }
  const [drawerOpen, setDrawerOpen] = useState(false);

  const rows = useFilteredEmployees(employees, filters, issues.counts);
  const view = viewChoice ?? (isMobile ? 'person' : 'team');
  const feedbackKey = `${department?.id}|${monthKey}`;
  const shown = feedback && feedback.key === feedbackKey ? feedback : null;

  const focusCell = useCallback(({ employeeId, date }) => {
    // Garante que a linha esteja visível: limpa a busca (mantém "só com alertas").
    setFilters((f) => ({ ...DEFAULT_FILTERS, onlyAlerts: f.onlyAlerts }));
    setPersonId(employeeId);
    setFocusTarget((t) => ({ employeeId, date, nonce: (t?.nonce ?? 0) + 1 }));
    setDrawerOpen(false);
  }, []);

  const runGenerate = () => {
    setConfirm(null);
    const result = generateMonth();
    if (result) setFeedback({ key: feedbackKey, red: result.summary.red, yellow: result.summary.yellow });
  };
  const runClear = () => {
    setConfirm(null);
    clearMonth();
    setFeedback(null);
  };

  const hasSchedule = employees.length > 0 && cells.length > 0;
  const status = validation?.summary.status ?? 'GREEN';
  const total = validation?.summary.total ?? 0;
  const pill = {
    GREEN: { cls: 'border-emerald-600 bg-emerald-50 text-emerald-900', Icon: ShieldCheck, text: 'Mês dentro da CLT' },
    YELLOW: { cls: 'border-amber-500 bg-amber-50 text-amber-900', Icon: TriangleAlert, text: `${total} alerta${total === 1 ? '' : 's'} no mês` },
    RED: { cls: 'border-rose-600 bg-rose-50 text-rose-900', Icon: OctagonAlert, text: `${total} alerta${total === 1 ? '' : 's'} no mês` },
  }[status];

  let body;
  if (employees.length === 0) {
    body = (
      <div className={`${cardCls} p-8 text-center`}>
        <Users size={16} aria-hidden="true" className="mx-auto mb-2 text-slate-600" />
        <h2 className="text-base font-semibold text-slate-900">Nenhum funcionário neste setor</h2>
        <p className="mt-1 text-sm text-slate-600">Cadastre a equipe na aba Equipe para montar a escala.</p>
      </div>
    );
  } else if (cells.length === 0) {
    body = (
      <div className={`${cardCls} p-8 text-center`} data-testid="month-empty">
        <CalendarX2 size={16} aria-hidden="true" className="mx-auto mb-2 text-slate-600" />
        <h2 className="text-base font-semibold text-slate-900">Sem escala em {formatMonthLabel(monthKey)}</h2>
        <p className="mx-auto mb-4 mt-1 max-w-md text-sm text-slate-600">Gere o mês inteiro de uma vez: a escala é montada semana a semana, uma encadeada na outra.</p>
        <button type="button" className={btnPrimary} onClick={() => setConfirm('generate')}>
          <Sparkles size={16} aria-hidden="true" />
          Gerar mês
        </button>
      </div>
    );
  } else if (view === 'person') {
    body = <MonthPersonView data={data} rows={rows} personId={personId} onPersonChange={setPersonId} focusTarget={focusTarget} />;
  } else {
    body = <MonthTeamMatrix data={data} rows={rows} focusTarget={focusTarget} />;
  }

  return (
    <div className="flex flex-col gap-3 pb-20 sm:pb-0">
      <MonthToolbar
        filters={filters}
        onFiltersChange={setFilters}
        view={view}
        onViewChange={setViewChoice}
        feedback={shown}
        onGenerate={() => setConfirm('generate')}
        onClear={() => setConfirm('clear')}
      />
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">{body}</div>
        {hasSchedule && (
          <aside aria-label="Painel de alertas do mês" className="sticky top-28 hidden max-h-[calc(100dvh-8rem)] w-80 shrink-0 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-sm xl:block">
            <MonthPanel data={data} onFocusCell={focusCell} />
          </aside>
        )}
      </div>

      {hasSchedule && (
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label={`Abrir resumo do mês: ${pill.text}`}
          className={`fixed bottom-[4.5rem] right-3 z-30 flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-full border-2 px-2.5 text-sm font-bold shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 sm:bottom-6 sm:px-3 xl:hidden ${pill.cls}`}
        >
          <pill.Icon size={16} aria-hidden="true" />
          <span className="hidden sm:inline">{pill.text}</span>
          {status !== 'GREEN' && <span className="tabular-nums sm:hidden">{total}</span>}
        </button>
      )}
      {drawerOpen && hasSchedule && (
        <Modal title="Resumo do mês" onClose={() => setDrawerOpen(false)}>
          <MonthPanel data={data} onFocusCell={focusCell} />
        </Modal>
      )}

      {confirm === 'generate' && <GenerateMonthDialog monthKey={monthKey} weeks={weeks} onConfirm={runGenerate} onCancel={() => setConfirm(null)} />}
      {confirm === 'clear' && <ClearMonthDialog monthKey={monthKey} weeks={weeks} onConfirm={runClear} onCancel={() => setConfirm(null)} />}
    </div>
  );
}
