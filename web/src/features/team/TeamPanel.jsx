import { memo, useCallback, useDeferredValue, useMemo, useState } from 'react';
import { ClipboardPaste, Pencil, Search, Trash2, UserPlus, Users } from 'lucide-react';
import { useScheduleStore } from '../../store/useScheduleStore.js';
import { selectActiveDepartment } from '../../store/selectors.js';
import { AbsencesPanel } from './AbsencesPanel.jsx';
import { EmployeeForm } from './EmployeeForm.jsx';
import { PasteListModal } from './PasteListModal.jsx';
import { Modal, btnDanger, btnPrimary, btnSecondary, cardCls, inputCls } from './Modal.jsx';

export const STATUS_LABELS = {
  ACTIVE: 'Ativo',
  VACATION: 'Férias',
  MEDICAL_LEAVE: 'Atestado',
  INACTIVE: 'Inativo',
};

const STATUS_STYLE = {
  ACTIVE: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  VACATION: 'border-sky-300 bg-sky-50 text-sky-900',
  MEDICAL_LEAVE: 'border-amber-400 bg-amber-50 text-amber-900',
  INACTIVE: 'border-slate-300 bg-slate-100 text-slate-700',
};

const normalize = (text) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Linha da lista: memoizada para que digitar na busca não re-renderize quem não mudou. */
const EmployeeRow = memo(function EmployeeRow({ employee, onEdit, onRemove, onStatus }) {
  const { id, name, roleTitle, tags, status, sundayGroup } = employee;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
      <div className="min-w-0 flex-1 basis-48">
        <p className="truncate font-medium text-slate-900">{name}</p>
        <p className="truncate text-xs text-slate-600">{roleTitle || 'Sem função'}</p>
      </div>
      {tags?.length > 0 && (
        <ul aria-label={`Tags de ${name}`} className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <li key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
              {tag}
            </li>
          ))}
        </ul>
      )}
      {status === 'ACTIVE' && (
        <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-xs font-medium text-white">Dom G{sundayGroup}</span>
      )}
      <select
        aria-label={`Status de ${name}`}
        value={status}
        onChange={(e) => onStatus(id, e.target.value)}
        className={`rounded-md border px-2 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-emerald-600 ${STATUS_STYLE[status] ?? STATUS_STYLE.INACTIVE}`}
      >
        {Object.entries(STATUS_LABELS).map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
      <div className="flex">
        <button
          type="button"
          aria-label={`Editar ${name}`}
          onClick={() => onEdit(employee)}
          className="rounded-md p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-600"
        >
          <Pencil size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={`Remover ${name}`}
          onClick={() => onRemove(employee)}
          className="rounded-md p-2 text-slate-600 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-rose-600"
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
    </li>
  );
});

function Counter({ label, value, hint }) {
  return (
    <div className={`${cardCls} px-3 py-2`}>
      <p className="text-xs text-slate-600">{label}</p>
      <p className="text-lg font-semibold text-slate-900">{value}</p>
      {hint && <p className="text-xs text-slate-600">{hint}</p>}
    </div>
  );
}

/** Estado vazio: sem setor ativo. */
function EmptyState() {
  return (
    <div className={`${cardCls} mx-auto max-w-lg p-6 text-center`}>
      <Users size={16} aria-hidden="true" className="mx-auto mb-2 text-slate-600" />
      <h2 className="mb-1 text-base font-semibold text-slate-900">Nenhum setor ativo</h2>
      <p className="mb-4 text-slate-600">
        Crie um setor para cadastrar a equipe ou comece com uma loja de exemplo (3 turnos, regras de cobertura e funcionários prontos) para
        explorar o sistema.
      </p>
      <button type="button" className={btnPrimary} onClick={() => useScheduleStore.getState().loadSampleStore()}>
        Carregar Loja Exemplo (Seção com 26 Funcionários)
      </button>
    </div>
  );
}

/** Tela de equipe do setor ativo: busca, contadores, lista, formulário, colar lista e ausências. */
export function TeamPanel() {
  const department = useScheduleStore(selectActiveDepartment);
  const allEmployees = useScheduleStore((s) => s.employees);
  const employees = useMemo(
    () => allEmployees.filter((e) => e.departmentId === department?.id),
    [allEmployees, department?.id],
  );
  const [tab, setTab] = useState('team');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [formTarget, setFormTarget] = useState(null); // null | 'new' | employee
  const [pasteOpen, setPasteOpen] = useState(false);
  const [toRemove, setToRemove] = useState(null);

  const indexed = useMemo(
    () => employees.map((e) => ({ e, text: normalize([e.name, e.roleTitle, ...(e.tags ?? [])].filter(Boolean).join(' ')) })),
    [employees],
  );
  const visible = useMemo(() => {
    const q = normalize(deferredQuery.trim());
    return q ? indexed.filter((x) => x.text.includes(q)).map((x) => x.e) : employees;
  }, [indexed, employees, deferredQuery]);

  const counts = useMemo(() => {
    const c = { ACTIVE: 0, VACATION: 0, MEDICAL_LEAVE: 0 };
    employees.forEach((e) => {
      if (e.status in c) c[e.status] += 1;
    });
    return c;
  }, [employees]);
  const capacity = Math.floor((5 / 7) * counts.ACTIVE);

  const handleEdit = useCallback((employee) => setFormTarget(employee), []);
  const handleRemove = useCallback((employee) => setToRemove(employee), []);
  const handleStatus = useCallback((id, status) => useScheduleStore.getState().setEmployeeStatus(id, status), []);

  if (!department) return <EmptyState />;

  return (
    <section aria-label="Equipe" className="space-y-3 text-sm text-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Seções da equipe" className="inline-flex rounded-lg bg-slate-100 p-0.5">
          {[
            ['team', 'Equipe'],
            ['absences', 'Ausências'],
          ].map(([value, text]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-emerald-600 ${
                tab === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {text}
            </button>
          ))}
        </div>
        {tab === 'team' && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnSecondary} onClick={() => setPasteOpen(true)}>
              <ClipboardPaste size={16} aria-hidden="true" />
              Colar Lista de Nomes
            </button>
            <button type="button" className={btnPrimary} onClick={() => setFormTarget('new')}>
              <UserPlus size={16} aria-hidden="true" />
              Adicionar funcionário
            </button>
          </div>
        )}
      </div>

      {tab === 'absences' ? (
        <AbsencesPanel />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Counter label="Ativos" value={counts.ACTIVE} />
            <Counter label="De férias" value={counts.VACATION} />
            <Counter label="Afastados" value={counts.MEDICAL_LEAVE} />
            <Counter label="Capacidade diária" value={`≈ ${capacity}`} hint="5/7 dos ativos" />
          </div>

          <div className="relative">
            <label htmlFor="team-search" className="sr-only">
              Buscar por nome, função ou tag
            </label>
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              id="team-search"
              type="search"
              className={`${inputCls} pl-8`}
              placeholder="Buscar por nome, função ou tag"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className={cardCls}>
            {employees.length === 0 ? (
              <p className="p-4 text-slate-600">Nenhum funcionário neste setor. Adicione um ou cole uma lista de nomes.</p>
            ) : visible.length === 0 ? (
              <p role="status" className="p-4 text-slate-600">
                Nenhum funcionário encontrado para “{deferredQuery}”.
              </p>
            ) : (
              <ul aria-label="Funcionários" className="divide-y divide-slate-100">
                {visible.map((employee) => (
                  <EmployeeRow key={employee.id} employee={employee} onEdit={handleEdit} onRemove={handleRemove} onStatus={handleStatus} />
                ))}
              </ul>
            )}
          </div>
          <p className="text-xs text-slate-600" role="status">
            {visible.length} de {employees.length} funcionários
          </p>
        </>
      )}

      {formTarget && <EmployeeForm employee={formTarget === 'new' ? undefined : formTarget} onClose={() => setFormTarget(null)} />}
      {pasteOpen && <PasteListModal onClose={() => setPasteOpen(false)} />}
      {toRemove && (
        <Modal
          title="Remover funcionário"
          onClose={() => setToRemove(null)}
          footer={
            <>
              <button type="button" className={btnSecondary} data-autofocus onClick={() => setToRemove(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className={btnDanger}
                onClick={() => {
                  useScheduleStore.getState().removeEmployee(toRemove.id);
                  setToRemove(null);
                }}
              >
                Remover
              </button>
            </>
          }
        >
          <p>
            Remover <strong>{toRemove.name}</strong>? As ausências e as células da grade dessa pessoa também serão apagadas. Você pode desfazer
            depois.
          </p>
        </Modal>
      )}
    </section>
  );
}
