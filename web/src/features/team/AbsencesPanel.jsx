import { useId, useMemo, useState } from 'react';
import { CalendarOff, Info, Trash2 } from 'lucide-react';
import { useScheduleStore } from '../../store/useScheduleStore.js';
import { btnPrimary, cardCls, inputCls } from './Modal.jsx';

export const ABSENCE_TYPES = {
  VACATION: 'Férias',
  MEDICAL: 'Atestado',
  COMP_TIME: 'Banco de horas',
  OTHER: 'Outro',
};

/** 'YYYY-MM-DD' -> 'DD/MM/AAAA' */
const formatDate = (iso) => iso.split('-').reverse().join('/');

/** Calendário simples de ausências do setor ativo (usa o store diretamente). */
export function AbsencesPanel() {
  const uid = useId();
  const departmentId = useScheduleStore((s) => s.activeDepartmentId);
  const allEmployees = useScheduleStore((s) => s.employees);
  const allAbsences = useScheduleStore((s) => s.absences);
  const employees = useMemo(() => allEmployees.filter((e) => e.departmentId === departmentId), [allEmployees, departmentId]);
  const absences = useMemo(() => {
    const ids = new Set(employees.map((e) => e.id));
    return allAbsences.filter((a) => ids.has(a.employeeId));
  }, [allAbsences, employees]);
  const [employeeId, setEmployeeId] = useState('');
  const [type, setType] = useState('VACATION');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const names = useMemo(() => new Map(employees.map((e) => [e.id, e.name])), [employees]);
  const sorted = useMemo(
    () => [...absences].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate)),
    [absences],
  );

  const submit = (event) => {
    event.preventDefault();
    if (!employeeId) return setError('Escolha o funcionário.');
    if (!startDate || !endDate) return setError('Informe a data de início e a data de fim.');
    if (endDate < startDate) return setError('A data de fim não pode ser anterior à data de início.');
    setError('');
    useScheduleStore.getState().addAbsence({ employeeId, type, startDate, endDate, ...(notes.trim() ? { notes: notes.trim() } : {}) });
    setStartDate('');
    setEndDate('');
    setNotes('');
  };

  const id = (s) => `${uid}-${s}`;
  const label = 'mb-1 block text-xs font-medium text-slate-700';

  return (
    <section aria-labelledby={id('title')} className="space-y-3">
      <div className={`${cardCls} p-3`}>
        <h3 id={id('title')} className="mb-1 text-sm font-semibold text-slate-900">
          Lançar ausência
        </h3>
        <p className="mb-3 flex items-center gap-1.5 text-xs text-slate-600">
          <Info size={16} aria-hidden="true" className="shrink-0" />A grade bloqueia esses dias automaticamente
        </p>
        <form onSubmit={submit} noValidate className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor={id('emp')} className={label}>
              Funcionário
            </label>
            <select id={id('emp')} className={inputCls} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Selecione…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={id('type')} className={label}>
              Tipo
            </label>
            <select id={id('type')} className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
              {Object.entries(ABSENCE_TYPES).map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={id('start')} className={label}>
              Início
            </label>
            <input id={id('start')} type="date" className={inputCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label htmlFor={id('end')} className={label}>
              Fim
            </label>
            <input id={id('end')} type="date" className={inputCls} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <label htmlFor={id('notes')} className={label}>
              Observação
            </label>
            <input id={id('notes')} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && (
            <p role="alert" className="text-xs font-medium text-rose-700 sm:col-span-2 lg:col-span-4">
              {error}
            </p>
          )}
          <div className="sm:col-span-2 lg:col-span-4">
            <button type="submit" className={btnPrimary}>
              Adicionar ausência
            </button>
          </div>
        </form>
      </div>

      <div className={cardCls}>
        {sorted.length === 0 ? (
          <p className="flex items-center gap-2 p-4 text-slate-600">
            <CalendarOff size={16} aria-hidden="true" />
            Nenhuma ausência lançada neste setor.
          </p>
        ) : (
          <ul aria-label="Ausências do setor" className="divide-y divide-slate-100">
            {sorted.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">
                    {names.get(a.employeeId) ?? 'Funcionário removido'}{' '}
                    <span className="font-normal text-slate-600">· {ABSENCE_TYPES[a.type] ?? a.type}</span>
                  </p>
                  <p className="text-xs text-slate-600">
                    {formatDate(a.startDate)} a {formatDate(a.endDate)}
                    {a.notes ? ` · ${a.notes}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Remover ausência de ${names.get(a.employeeId) ?? 'funcionário'} (${formatDate(a.startDate)})`}
                  onClick={() => useScheduleStore.getState().removeAbsence(a.id)}
                  className="rounded-md p-2 text-slate-600 hover:bg-rose-50 hover:text-rose-700"
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
