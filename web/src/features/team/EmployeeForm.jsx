import { useId, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useScheduleStore } from '../../store/useScheduleStore.js';
import { classifyPhone } from '../../store/parseEmployeeList.js';
import { Modal, btnPrimary, btnSecondary, inputCls } from './Modal.jsx';

const DAYS = [
  ['SEG', 'Seg'],
  ['TER', 'Ter'],
  ['QUA', 'Qua'],
  ['QUI', 'Qui'],
  ['SEX', 'Sex'],
  ['SAB', 'Sáb'],
  ['DOM', 'Dom'],
];
const DEFAULT_TAGS = ['Líder', 'Serra', 'Abertura', 'Fechamento'];
const sameTag = (a, b) => a.toLowerCase() === b.toLowerCase();

/**
 * Formulário (modal) de criação/edição de funcionário do setor ativo.
 * @param {{ employee?: any, onClose: () => void, onSaved?: (employee: any) => void }} props
 *   employee: funcionário a editar (omitido = criar)
 */
export function EmployeeForm({ employee, onClose, onSaved }) {
  const uid = useId();
  const departmentId = useScheduleStore((s) => s.activeDepartmentId);
  const allEmployees = useScheduleStore((s) => s.employees);
  const allShifts = useScheduleStore((s) => s.shifts);
  const employees = useMemo(() => allEmployees.filter((e) => e.departmentId === departmentId), [allEmployees, departmentId]);
  const shifts = useMemo(() => allShifts.filter((x) => x.departmentId === departmentId), [allShifts, departmentId]);

  const [name, setName] = useState(employee?.name ?? '');
  const [roleTitle, setRoleTitle] = useState(employee?.roleTitle ?? '');
  const [phone, setPhone] = useState(employee?.phone ?? '');
  const [tags, setTags] = useState(employee?.tags ?? []);
  const [tagDraft, setTagDraft] = useState('');
  const [days, setDays] = useState(employee?.fixedConstraints?.unavailableDays ?? []);
  const [shiftIds, setShiftIds] = useState(employee?.fixedConstraints?.unavailableShiftIds ?? []);
  const [sundayRule, setSundayRule] = useState(employee?.customSundayRule ?? '');
  const [errors, setErrors] = useState({});

  const suggestions = useMemo(() => {
    const all = new Set(DEFAULT_TAGS);
    employees.forEach((e) => e.tags?.forEach((t) => all.add(t)));
    return [...all].filter((t) => !tags.some((x) => sameTag(x, t)));
  }, [employees, tags]);

  const addTag = (raw) => {
    const tag = raw.trim();
    if (!tag) return;
    setTags((list) => (list.some((t) => sameTag(t, tag)) ? list : [...list, tag]));
    setTagDraft('');
  };
  const toggle = (setter, value) => setter((list) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]));

  const handleSubmit = (event) => {
    event.preventDefault();
    const next = {};
    if (!name.trim()) next.name = 'Informe o nome do funcionário.';
    const phoneStatus = classifyPhone(phone);
    if (phoneStatus === 'cpf') {
      next.phone = 'Isso parece um CPF. Não precisamos de CPF: informe só o telefone com DDD, por exemplo (11) 91234-5678.';
    } else if (phoneStatus === 'invalid') {
      next.phone = 'Telefone inválido. Use DDD + número, por exemplo (11) 91234-5678.';
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    const draft = tagDraft.trim();
    const finalTags = draft && !tags.some((t) => sameTag(t, draft)) ? [...tags, draft] : tags;
    const data = {
      name: name.trim(),
      roleTitle: roleTitle.trim(),
      phone: phone.trim() || undefined,
      tags: finalTags,
      fixedConstraints: { unavailableDays: days, unavailableShiftIds: shiftIds },
      customSundayRule: sundayRule || undefined,
    };
    const { addEmployee, updateEmployee } = useScheduleStore.getState();
    if (employee) {
      updateEmployee(employee.id, data);
      onSaved?.({ ...employee, ...data });
    } else {
      const created = addEmployee(data);
      onSaved?.(created);
    }
    onClose();
  };

  const id = (s) => `${uid}-${s}`;
  const label = 'mb-1 block text-xs font-medium text-slate-700';

  return (
    <Modal
      title={employee ? 'Editar funcionário' : 'Novo funcionário'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form={id('form')} className={btnPrimary}>
            Salvar
          </button>
        </>
      }
    >
      <form id={id('form')} onSubmit={handleSubmit} noValidate className="space-y-3">
        <div>
          <label htmlFor={id('name')} className={label}>
            Nome *
          </label>
          <input
            id={id('name')}
            data-autofocus
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={errors.name ? 'true' : undefined}
            aria-describedby={errors.name ? id('name-err') : undefined}
          />
          {errors.name && (
            <p id={id('name-err')} role="alert" className="mt-1 text-xs font-medium text-rose-700">
              {errors.name}
            </p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={id('role')} className={label}>
              Função
            </label>
            <input id={id('role')} className={inputCls} value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} placeholder="Ex.: Açougueiro" />
          </div>
          <div>
            <label htmlFor={id('phone')} className={label}>
              Telefone (opcional)
            </label>
            <input
              id={id('phone')}
              type="tel"
              className={inputCls}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-invalid={errors.phone ? 'true' : undefined}
              aria-describedby={`${id('phone-hint')}${errors.phone ? ` ${id('phone-err')}` : ''}`}
            />
            <p id={id('phone-hint')} className="mt-1 text-xs text-slate-600">
              Opcional. Usado só para enviar a escala pelo WhatsApp.
            </p>
            {errors.phone && (
              <p id={id('phone-err')} role="alert" className="mt-1 text-xs font-medium text-rose-700">
                {errors.phone}
              </p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor={id('tag')} className={label}>
            Tags
          </label>
          {tags.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="Tags do funcionário">
              {tags.map((tag) => (
                <li
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200"
                >
                  {tag}
                  <button
                    type="button"
                    aria-label={`Remover tag ${tag}`}
                    onClick={() => setTags((list) => list.filter((t) => t !== tag))}
                    className="rounded-full p-0.5 hover:bg-emerald-100"
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            id={id('tag')}
            className={inputCls}
            value={tagDraft}
            placeholder="Digite e pressione Enter"
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addTag(tagDraft);
              }
            }}
          />
          {suggestions.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-600">Sugestões:</span>
              {suggestions.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => addTag(tag)}
                  aria-label={`Adicionar tag ${tag}`}
                  className="inline-flex items-center gap-0.5 rounded-full border border-slate-300 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50"
                >
                  <Plus size={12} aria-hidden="true" />
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        <fieldset className="rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-xs font-medium text-slate-700">Restrições individuais</legend>
          <p className="mb-2 text-xs text-slate-600">Ex.: estuda às terças e quintas à noite.</p>
          <p className="mb-1 text-xs font-medium text-slate-700">Dias indisponíveis</p>
          <div className="mb-3 flex flex-wrap gap-2">
            {DAYS.map(([value, text]) => (
              <label key={value} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1.5 text-xs">
                <input type="checkbox" className="accent-emerald-600" checked={days.includes(value)} onChange={() => toggle(setDays, value)} />
                {text}
              </label>
            ))}
          </div>
          <p className="mb-1 text-xs font-medium text-slate-700">Turnos indisponíveis</p>
          {shifts.length === 0 ? (
            <p className="text-xs text-slate-600">Nenhum turno cadastrado neste setor.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {shifts.map((shift) => (
                <label key={shift.id} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1.5 text-xs">
                  <input
                    type="checkbox"
                    className="accent-emerald-600"
                    checked={shiftIds.includes(shift.id)}
                    onChange={() => toggle(setShiftIds, shift.id)}
                  />
                  {shift.name}
                  <span className="text-slate-600">
                    {shift.startTime}–{shift.endTime}
                  </span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <div>
          <label htmlFor={id('sunday')} className={label}>
            Regra de domingo
          </label>
          <select id={id('sunday')} className={inputCls} value={sundayRule} onChange={(e) => setSundayRule(e.target.value)}>
            <option value="">Herdar do setor</option>
            <option value="1_IN_2">1 domingo em 2</option>
            <option value="1_IN_3">1 domingo em 3</option>
          </select>
        </div>
      </form>
    </Modal>
  );
}
