import { useCallback, useState } from 'react';
import { CalendarDays, OctagonAlert, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useScheduleStore } from '../../store/useScheduleStore.js';
import { selectActiveDepartment, selectWeekValidation } from '../../store/selectors.js';
import { Modal, btnPrimary, btnSecondary, cardCls } from '../team/Modal.jsx';
import { GridToolbar } from './GridToolbar.jsx';
import { ScheduleGrid } from './ScheduleGrid.jsx';
import { ValidationPanel } from './ValidationPanel.jsx';
import { DEFAULT_FILTERS } from './gridUtils.js';

/** Estado vazio: sem setor ativo. */
function NoDepartment() {
  const loadSampleStore = useScheduleStore((s) => s.loadSampleStore);
  const addDepartment = useScheduleStore((s) => s.addDepartment);
  return (
    <div className={`${cardCls} mx-auto mt-4 max-w-lg p-6 text-center`}>
      <CalendarDays size={16} aria-hidden="true" className="mx-auto mb-2 text-slate-600" />
      <h2 className="mb-1 text-base font-semibold text-slate-900">Nenhum setor ativo</h2>
      <p className="mb-4 text-sm text-slate-600">
        Comece com uma loja de exemplo (3 turnos, regras de cobertura e funcionários prontos) para explorar a escala, ou crie seu primeiro setor do zero.
      </p>
      <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
        <button type="button" className={btnPrimary} onClick={loadSampleStore}>
          Carregar Loja Exemplo (Seção com 26 Funcionários)
        </button>
        <button type="button" className={btnSecondary} onClick={() => addDepartment({ name: 'Meu Setor' })}>
          Começar do zero
        </button>
      </div>
    </div>
  );
}

/** Aba Escala: barra de ferramentas, grade e Semáforo CLT (ao lado em telas largas, gaveta no celular). */
export function ScheduleView() {
  const department = useScheduleStore(selectActiveDepartment);
  const validation = useScheduleStore(selectWeekValidation);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [focusTarget, setFocusTarget] = useState(null);
  const [heatOpen, setHeatOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const focusCell = useCallback(({ employeeId, date }) => {
    // Garante que a linha esteja visível: limpa busca/turno/tag (mantém "só com alertas").
    setFilters((f) => ({ ...DEFAULT_FILTERS, onlyAlerts: f.onlyAlerts }));
    setFocusTarget((t) => ({ employeeId, date, nonce: (t?.nonce ?? 0) + 1 }));
    setDrawerOpen(false);
  }, []);
  const showCoverage = useCallback(() => {
    setHeatOpen(true);
    setDrawerOpen(false);
  }, []);

  if (!department) return <NoDepartment />;

  const status = validation?.status ?? 'GREEN';
  const total = validation?.summary.total ?? 0;
  const pill = {
    GREEN: { cls: 'border-emerald-600 bg-emerald-50 text-emerald-900', Icon: ShieldCheck, text: 'Dentro da CLT' },
    YELLOW: { cls: 'border-amber-500 bg-amber-50 text-amber-900', Icon: TriangleAlert, text: `${total} alerta${total === 1 ? '' : 's'}` },
    RED: { cls: 'border-rose-600 bg-rose-50 text-rose-900', Icon: OctagonAlert, text: `${total} alerta${total === 1 ? '' : 's'}` },
  }[status];

  return (
    <div className="flex flex-col gap-3 pb-20 sm:pb-0">
      <GridToolbar filters={filters} onFiltersChange={setFilters} />
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <ScheduleGrid filters={filters} focusTarget={focusTarget} heatOpen={heatOpen} onHeatOpenChange={setHeatOpen} />
        </div>
        <aside aria-label="Painel do Semáforo CLT" className="sticky top-28 hidden max-h-[calc(100dvh-8rem)] w-80 shrink-0 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:block">
          <ValidationPanel onFocusCell={focusCell} onShowCoverage={showCoverage} />
        </aside>
      </div>

      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-label={`Abrir Semáforo CLT: ${pill.text}`}
        className={`fixed bottom-[4.5rem] right-3 z-30 flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-full border-2 px-2.5 text-sm font-bold shadow-lg sm:px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 sm:bottom-6 lg:hidden ${pill.cls}`}
      >
        <pill.Icon size={16} aria-hidden="true" />
        <span className="hidden sm:inline">{pill.text}</span>
        {status !== 'GREEN' && <span className="tabular-nums sm:hidden">{total}</span>}
      </button>
      {drawerOpen && (
        <Modal title="Semáforo CLT" onClose={() => setDrawerOpen(false)}>
          <ValidationPanel onFocusCell={focusCell} onShowCoverage={showCoverage} />
        </Modal>
      )}
    </div>
  );
}
