import { useState } from 'react';
import { AlertTriangle, Check, Clock, Moon, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useScheduleStore } from '../../store/useScheduleStore.js';
import { selectActiveDepartment, selectDepartmentShifts } from '../../store/selectors.js';
import { analyzeShift, computeIsNight, formatHours, formatMinutes } from './shiftMetrics.js';
import { btnDanger, btnGhost, btnIcon, btnPrimary, card, errorCls, hintCls, input, labelCls } from './ui.js';

/** Paleta de 8 cores com contraste AA contra texto branco. */
export const SHIFT_COLORS = [
  { name: 'Azul', hex: '#1D4ED8' },
  { name: 'Verde', hex: '#047857' },
  { name: 'Roxo', hex: '#6D28D9' },
  { name: 'Rosa', hex: '#BE185D' },
  { name: 'Laranja', hex: '#B45309' },
  { name: 'Turquesa', hex: '#0F766E' },
  { name: 'Vermelho', hex: '#B91C1C' },
  { name: 'Cinza', hex: '#475569' },
];

export const DEFAULT_RETAIL_SHIFTS = [
  { code: 'T1', name: 'Abertura', startTime: '07:00', endTime: '16:24', breakDurationMinutes: 60, color: SHIFT_COLORS[0].hex },
  { code: 'T2', name: 'Intermediário', startTime: '10:00', endTime: '19:24', breakDurationMinutes: 60, color: SHIFT_COLORS[1].hex },
  { code: 'T3', name: 'Fechamento', startTime: '12:36', endTime: '22:00', breakDurationMinutes: 60, color: SHIFT_COLORS[2].hex },
];

const HEX = /^#[0-9a-fA-F]{6}$/;
const emptyDraft = (index) => ({
  name: '',
  code: `T${index + 1}`,
  startTime: '',
  endTime: '',
  breakDurationMinutes: '60',
  color: SHIFT_COLORS[index % SHIFT_COLORS.length].hex,
});

function validate(draft, shifts, editingId) {
  const errors = {};
  if (!draft.name.trim()) errors.name = 'Informe o nome do turno.';
  const code = draft.code.trim();
  if (!code) errors.code = 'Informe o código do turno.';
  else if (shifts.some((s) => s.id !== editingId && s.code.trim().toLowerCase() === code.toLowerCase())) {
    errors.code = `O código ${code} já está em uso neste setor.`;
  }
  if (!draft.startTime) errors.startTime = 'Informe o início.';
  if (!draft.endTime) errors.endTime = 'Informe o fim.';
  if (draft.startTime && draft.startTime === draft.endTime) errors.endTime = 'Início e fim não podem ser iguais.';
  const brk = draft.breakDurationMinutes;
  if (brk === '' || !Number.isFinite(Number(brk)) || Number(brk) < 0) errors.breakDurationMinutes = 'O intervalo deve ser 0 ou mais minutos.';
  if (!HEX.test(draft.color)) errors.color = 'Use uma cor hexadecimal, como #1D4ED8.';
  return errors;
}

/** Indicadores ao vivo (relógio, legal, semana, alertas) de um turno. */
function ShiftMetrics({ shift, department }) {
  const m = analyzeShift(shift, department);
  if (!m) return <p className={hintCls}>Informe início e fim para ver as horas.</p>;
  const night = computeIsNight(shift.startTime, shift.endTime);
  return (
    <div className="space-y-1 text-xs">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-slate-700">
        <span>Relógio: {formatMinutes(m.workMinutes)}/dia</span>
        <span>Legal: {formatMinutes(m.legalMinutes)}/dia</span>
        {night && (
          <span className="inline-flex items-center gap-1 font-medium text-indigo-800">
            <Moon size={16} aria-hidden="true" />
            Noturno
          </span>
        )}
      </p>
      <p className={m.overTarget ? 'font-medium text-rose-700' : 'font-medium text-emerald-800'} data-testid="weekly-hours" data-over={m.overTarget ? 'true' : 'false'}>
        Semana (5 dias): {formatHours(m.weeklyHours)} {m.overTarget ? 'acima' : 'dentro'} da meta de {formatHours(m.target)}
      </p>
      {m.breakTooShort && (
        <p role="alert" className="flex items-start gap-1 font-medium text-amber-800">
          <AlertTriangle size={16} className="mt-px shrink-0" aria-hidden="true" />
          Intervalo menor que o exigido: mínimo de {m.requiredBreak} min para este turno.
        </p>
      )}
      {m.overTenHours && (
        <p role="alert" className="flex items-start gap-1 font-medium text-amber-800">
          <AlertTriangle size={16} className="mt-px shrink-0" aria-hidden="true" />
          Jornada acima de 10h por dia (limite do art. 59 da CLT).
        </p>
      )}
    </div>
  );
}

/**
 * CRUD de turnos do setor ativo, com cálculo ao vivo de horas e alertas.
 * Sem props: usa o store.
 */
export function ShiftsEditor() {
  const department = useScheduleStore(selectActiveDepartment);
  const shifts = useScheduleStore(selectDepartmentShifts);
  const addShift = useScheduleStore((s) => s.addShift);
  const updateShift = useScheduleStore((s) => s.updateShift);
  const removeShift = useScheduleStore((s) => s.removeShift);

  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(() => emptyDraft(0));
  const [errors, setErrors] = useState({});
  const [confirmId, setConfirmId] = useState(null);

  if (!department) {
    return (
      <section aria-labelledby="shifts-title" className={`${card} p-4 text-sm text-slate-600`}>
        <h2 id="shifts-title" className="text-base font-semibold text-slate-900">
          Turnos
        </h2>
        <p className="mt-2">Crie um setor para cadastrar turnos.</p>
      </section>
    );
  }

  const set = (field) => (e) => setDraft((d) => ({ ...d, [field]: e.target.value }));
  const reset = () => {
    setEditingId(null);
    setErrors({});
    setDraft(emptyDraft(shifts.length));
  };

  const startEdit = (shift) => {
    setEditingId(shift.id);
    setErrors({});
    setConfirmId(null);
    setDraft({
      name: shift.name,
      code: shift.code,
      startTime: shift.startTime,
      endTime: shift.endTime,
      breakDurationMinutes: String(shift.breakDurationMinutes ?? 0),
      color: shift.color,
    });
  };

  const submit = (e) => {
    e.preventDefault();
    const found = validate(draft, shifts, editingId);
    setErrors(found);
    if (Object.keys(found).length) return;
    const data = {
      name: draft.name.trim(),
      code: draft.code.trim(),
      startTime: draft.startTime,
      endTime: draft.endTime,
      breakDurationMinutes: Number(draft.breakDurationMinutes),
      color: draft.color,
      isNightShift: computeIsNight(draft.startTime, draft.endTime),
    };
    if (editingId) updateShift(editingId, data);
    else addShift(data);
    setEditingId(null);
    setDraft(emptyDraft(editingId ? shifts.length : shifts.length + 1));
  };

  const useDefaults = () => {
    if (shifts.length) return;
    for (const s of DEFAULT_RETAIL_SHIFTS) addShift({ ...s, isNightShift: computeIsNight(s.startTime, s.endTime) });
    setDraft(emptyDraft(DEFAULT_RETAIL_SHIFTS.length));
  };

  const fieldProps = (field) => ({
    'aria-invalid': errors[field] ? 'true' : undefined,
    'aria-describedby': errors[field] ? `shift-${field}-error` : undefined,
  });
  const fieldError = (field) =>
    errors[field] && (
      <p id={`shift-${field}-error`} role="alert" className={errorCls}>
        {errors[field]}
      </p>
    );

  const draftNight = computeIsNight(draft.startTime, draft.endTime);

  return (
    <section aria-labelledby="shifts-title" className={`${card} p-4 text-sm text-slate-900`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="shifts-title" className="text-base font-semibold text-slate-900">
          Turnos de {department.name}
        </h2>
        {shifts.length === 0 && (
          <button type="button" className={btnGhost} onClick={useDefaults}>
            <Clock size={16} aria-hidden="true" />
            Usar turnos padrão do varejo
          </button>
        )}
      </div>

      {shifts.length === 0 ? (
        <p className="mt-3 text-slate-600">Nenhum turno cadastrado ainda.</p>
      ) : (
        <ul className="mt-3 grid gap-2 lg:grid-cols-2" aria-label="Lista de turnos">
          {shifts.map((shift) => (
            <li key={shift.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-start gap-2">
                <span
                  className="mt-0.5 inline-flex h-6 min-w-9 items-center justify-center rounded px-1.5 text-xs font-bold text-white"
                  style={{ backgroundColor: shift.color }}
                >
                  {shift.code}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">
                    {shift.name}{' '}
                    <span className="font-normal text-slate-700">
                      {shift.startTime}–{shift.endTime} · intervalo {shift.breakDurationMinutes} min
                    </span>
                  </p>
                  <div className="mt-1">
                    <ShiftMetrics shift={shift} department={department} />
                  </div>
                </div>
                <button type="button" className={btnIcon} aria-label={`Editar turno ${shift.code}`} onClick={() => startEdit(shift)}>
                  <Pencil size={16} aria-hidden="true" />
                </button>
                <button type="button" className={btnIcon} aria-label={`Remover turno ${shift.code}`} onClick={() => setConfirmId(shift.id)}>
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
              {confirmId === shift.id && (
                <div role="alertdialog" aria-label={`Confirmar remoção do turno ${shift.code}`} className="mt-2 rounded-lg border border-rose-300 bg-rose-50 p-2">
                  <p className="text-xs text-rose-900">As células da escala que usam este turno também serão apagadas.</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className={btnDanger}
                      onClick={() => {
                        removeShift(shift.id);
                        setConfirmId(null);
                        if (editingId === shift.id) reset();
                      }}
                    >
                      Confirmar remoção
                    </button>
                    <button type="button" className={btnGhost} onClick={() => setConfirmId(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} noValidate aria-labelledby="shift-form-title" className="mt-4 border-t border-slate-200 pt-4">
        <h3 id="shift-form-title" className="text-sm font-semibold text-slate-900">
          {editingId ? 'Editar turno' : 'Novo turno'}
        </h3>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-6">
          <div className="col-span-2 sm:col-span-2">
            <label htmlFor="shift-name" className={labelCls}>
              Nome do turno
            </label>
            <input id="shift-name" className={input} value={draft.name} onChange={set('name')} placeholder="Ex.: Abertura" {...fieldProps('name')} />
            {fieldError('name')}
          </div>
          <div>
            <label htmlFor="shift-code" className={labelCls}>
              Código
            </label>
            <input id="shift-code" className={input} value={draft.code} onChange={set('code')} placeholder="T1" {...fieldProps('code')} />
            {fieldError('code')}
          </div>
          <div>
            <label htmlFor="shift-start" className={labelCls}>
              Início
            </label>
            <input id="shift-start" type="time" className={input} value={draft.startTime} onChange={set('startTime')} {...fieldProps('startTime')} />
            {fieldError('startTime')}
          </div>
          <div>
            <label htmlFor="shift-end" className={labelCls}>
              Fim
            </label>
            <input id="shift-end" type="time" className={input} value={draft.endTime} onChange={set('endTime')} {...fieldProps('endTime')} />
            {fieldError('endTime')}
          </div>
          <div>
            <label htmlFor="shift-break" className={labelCls}>
              Intervalo (min)
            </label>
            <input id="shift-break" type="number" min="0" step="5" className={input} value={draft.breakDurationMinutes} onChange={set('breakDurationMinutes')} {...fieldProps('breakDurationMinutes')} />
            {fieldError('breakDurationMinutes')}
          </div>
        </div>

        <fieldset className="mt-3">
          <legend className={labelCls}>Cor do turno</legend>
          <div className="flex flex-wrap items-center gap-2">
            {SHIFT_COLORS.map((c) => {
              const selected = draft.color.toLowerCase() === c.hex.toLowerCase();
              return (
                <button
                  key={c.hex}
                  type="button"
                  aria-label={`Cor ${c.name}`}
                  aria-pressed={selected}
                  onClick={() => setDraft((d) => ({ ...d, color: c.hex }))}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 ${selected ? 'ring-2 ring-slate-900 ring-offset-2' : ''}`}
                  style={{ backgroundColor: c.hex }}
                >
                  {selected && <Check size={16} aria-hidden="true" />}
                </button>
              );
            })}
            <div className="ml-2 w-28">
              <label htmlFor="shift-color-hex" className="sr-only">
                Cor em hexadecimal
              </label>
              <input id="shift-color-hex" className={input} value={draft.color} onChange={set('color')} maxLength={7} {...fieldProps('color')} />
            </div>
          </div>
          {fieldError('color')}
        </fieldset>

        <div className="mt-3 rounded-lg bg-slate-50 p-3">
          <p className="mb-1 text-xs font-medium text-slate-700">Prévia ao vivo{draftNight ? ' (turno noturno: marcado automaticamente)' : ''}</p>
          <ShiftMetrics shift={draft} department={department} />
        </div>

        <div className="mt-3 flex gap-2">
          <button type="submit" className={btnPrimary}>
            {editingId ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
            {editingId ? 'Salvar turno' : 'Adicionar turno'}
          </button>
          {editingId && (
            <button type="button" className={btnGhost} onClick={reset}>
              <X size={16} aria-hidden="true" />
              Cancelar edição
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
