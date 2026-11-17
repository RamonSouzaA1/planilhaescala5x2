import { useRef, useState } from 'react';
import { CalendarDays, Clock, Compass, ShieldCheck, Users } from 'lucide-react';
import { useScheduleStore } from './store/useScheduleStore.js';
import { ScheduleView } from './features/grid/ScheduleView.jsx';
import { PeriodNav } from './features/grid/PeriodNav.jsx';
import { TeamPanel } from './features/team/TeamPanel.jsx';
import { DepartmentSettings } from './features/shifts/DepartmentSettings.jsx';
import { ShiftsEditor } from './features/shifts/ShiftsEditor.jsx';
import { CoverageEditor } from './features/shifts/CoverageEditor.jsx';
import { OnboardingWizard } from './features/wizard/OnboardingWizard.jsx';
import { EmptyScheduleState } from './features/wizard/EmptyScheduleState.jsx';
import { PrivacyModal } from './features/privacy/PrivacyModal.jsx';

const TABS = [
  { id: 'escala', label: 'Escala', Icon: CalendarDays },
  { id: 'equipe', label: 'Equipe', Icon: Users },
  { id: 'turnos', label: 'Turnos e Cobertura', Icon: Clock },
];

/** Casca do aplicativo: cabeçalho (setor e semana), abas (barra inferior no celular) e a área ativa. */
export default function App() {
  const [tab, setTab] = useState('escala');
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const tabRefs = useRef({});
  const departments = useScheduleStore((s) => s.departments);
  const activeDepartmentId = useScheduleStore((s) => s.activeDepartmentId);
  const setActiveDepartment = useScheduleStore((s) => s.setActiveDepartment);
  // Abre sozinho só na primeira visita: store vazio e guia ainda não visto nem pulado.
  const [wizardOpen, setWizardOpen] = useState(() => {
    const s = useScheduleStore.getState();
    return s.onboarding === 'pending' && s.departments.length === 0;
  });

  const onTabKeyDown = (e) => {
    const i = TABS.findIndex((t) => t.id === tab);
    let next = null;
    if (e.key === 'ArrowRight') next = TABS[(i + 1) % TABS.length];
    else if (e.key === 'ArrowLeft') next = TABS[(i - 1 + TABS.length) % TABS.length];
    else if (e.key === 'Home') next = TABS[0];
    else if (e.key === 'End') next = TABS[TABS.length - 1];
    if (!next) return;
    e.preventDefault();
    setTab(next.id);
    tabRefs.current[next.id]?.focus();
  };

  return (
    <div className="min-h-dvh bg-slate-50 text-sm text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-[110rem] flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 sm:px-6">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-600 text-white">
              <CalendarDays size={16} />
            </span>
            <h1 className="text-base font-semibold tracking-tight sm:text-lg">Planilha Escala 5x2</h1>
          </div>

          {departments.length > 0 && (
            <select
              aria-label="Trocar setor"
              value={activeDepartmentId ?? ''}
              onChange={(e) => setActiveDepartment(e.target.value)}
              className="h-9 max-w-[11rem] rounded-lg border border-slate-300 bg-white px-2.5 text-sm font-medium text-slate-900 focus-visible:outline-2 focus-visible:outline-emerald-600"
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            <Compass size={16} aria-hidden="true" />
            <span className="max-sm:sr-only">Guia de configuração</span>
          </button>

          <PeriodNav />
        </div>

        <nav
          role="tablist"
          aria-label="Áreas do aplicativo"
          onKeyDown={onTabKeyDown}
          className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_3px_rgba(15,23,42,0.08)] sm:static sm:mx-auto sm:flex sm:max-w-[110rem] sm:gap-1 sm:border-t-0 sm:px-6 sm:pb-0 sm:shadow-none"
        >
          {TABS.map(({ id, label, Icon }) => {
            const selected = tab === id;
            return (
              <button
                key={id}
                ref={(el) => {
                  tabRefs.current[id] = el;
                }}
                id={`tab-${id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`panel-${id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(id)}
                className={`flex flex-col items-center gap-0.5 px-2 py-2 text-xs font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-600 sm:flex-row sm:gap-1.5 sm:border-b-2 sm:px-4 sm:text-sm ${
                  selected ? 'text-emerald-800 sm:border-emerald-600' : 'text-slate-600 hover:text-slate-900 sm:border-transparent'
                }`}
              >
                <Icon size={16} aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-[110rem] px-3 pb-4 pt-3 sm:px-6">
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={-1} className="focus:outline-none">
          {tab === 'escala' && (departments.length === 0 ? <EmptyScheduleState onStartGuide={() => setWizardOpen(true)} /> : <ScheduleView />)}
          {tab === 'equipe' && <TeamPanel />}
          {tab === 'turnos' && (
            <div className="mx-auto flex max-w-4xl flex-col gap-4">
              <DepartmentSettings />
              <ShiftsEditor />
              <CoverageEditor />
            </div>
          )}
        </div>
      </main>

      <footer className="mx-auto max-w-[110rem] px-3 pb-24 text-xs text-slate-600 sm:px-6 sm:pb-6">
        <button
          type="button"
          onClick={() => setPrivacyOpen(true)}
          className="inline-flex items-center gap-1 rounded-md px-1 py-1 underline hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-emerald-600"
        >
          <ShieldCheck size={14} aria-hidden="true" />
          Privacidade
        </button>
      </footer>

      {privacyOpen && <PrivacyModal onClose={() => setPrivacyOpen(false)} />}

      {wizardOpen && (
        <OnboardingWizard
          onClose={() => setWizardOpen(false)}
          onViewSchedule={() => {
            setTab('escala');
            setWizardOpen(false);
          }}
        />
      )}
    </div>
  );
}
