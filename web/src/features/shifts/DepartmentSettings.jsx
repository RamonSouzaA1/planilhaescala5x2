import { useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useScheduleStore } from '../../store/useScheduleStore.js';
import { selectActiveDepartment } from '../../store/selectors.js';
import { getLegalWeeklyCapHours } from '@escala/shared/utils/cltValidator.js';
import { describeLegalWeeklyCap, todayLocalDate } from './shiftMetrics.js';
import { btnDanger, btnGhost, btnIcon, btnPrimary, card, errorCls, hintCls, input, labelCls } from './ui.js';

/** Metas pré-definidas do seletor (horas por semana). */
const PRESET_TARGETS = [
  { hours: 42, label: '42h (a partir de dez/2026)' },
  { hours: 40, label: '40h (a partir de dez/2027)' },
];

/**
 * Meta personalizada válida: inteiro de 1 até o teto legal da data (igual à API).
 * @param {string} raw @param {number} cap
 * @returns {number | null}
 */
function parseTarget(raw, cap) {
  const value = Number(raw);
  return raw !== '' && Number.isInteger(value) && value >= 1 && value <= cap ? value : null;
}

const SUNDAY_HELP = {
  '1_IN_3': '1 em 3: cada pessoa folga pelo menos um domingo a cada 3 semanas (Lei 10.101/2000).',
  '1_IN_2': '1 em 2: cada pessoa folga um domingo a cada 2 semanas (mais folgas de domingo; exige equipe maior).',
  CUSTOM: 'Personalizada: cada pessoa pode ter sua própria regra (1 em 2 ou 1 em 3) definida na equipe.',
};

/**
 * Configuração do setor: seleção do setor ativo, criar/renomear/remover e regras do setor
 * (domingo, meta semanal, intervalo mínimo e deslocamento do ciclo). Sem props: usa o store.
 */
export function DepartmentSettings() {
  const departments = useScheduleStore((s) => s.departments);
  const department = useScheduleStore(selectActiveDepartment);
  const addDepartment = useScheduleStore((s) => s.addDepartment);
  const updateDepartment = useScheduleStore((s) => s.updateDepartment);
  const removeDepartment = useScheduleStore((s) => s.removeDepartment);
  const setActiveDepartment = useScheduleStore((s) => s.setActiveDepartment);

  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [targetDraft, setTargetDraft] = useState(null);
  const [targetError, setTargetError] = useState('');

  // Mesmo critério da API: teto legal pela data de hoje.
  const today = todayLocalDate();
  const legalCap = getLegalWeeklyCapHours(today);

  const create = (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return setCreateError('Informe o nome do setor.');
    if (departments.some((d) => d.name.toLowerCase() === name.toLowerCase())) return setCreateError('Já existe um setor com esse nome.');
    addDepartment({ name });
    setNewName('');
    setCreateError('');
  };

  const saveRename = (e) => {
    e.preventDefault();
    const name = renameValue.trim();
    if (!name || !department) return;
    updateDepartment(department.id, { name });
    setRenaming(false);
  };

  const target = Number(department?.weeklyHoursTarget);
  const targetSelect = customMode || (target !== 42 && target !== 40) ? 'custom' : String(target);
  const minBreak = Number(department?.minBreakMinutes) === 30 ? 30 : 60;
  const offset = Number(department?.sundayCycleOffset) || 0;
  const rule = department?.defaultSundayRule ?? '1_IN_3';
  const patch = (p) => updateDepartment(department.id, p);
  const targetOverCap = Number.isFinite(target) && target > legalCap;
  const resetTargetEditing = () => {
    setCustomMode(false);
    setTargetDraft(null);
    setTargetError('');
  };
  const changeCustomTarget = (raw) => {
    setTargetDraft(raw);
    const value = parseTarget(raw, legalCap);
    if (value === null) return setTargetError(`Use um número inteiro de 1 a ${legalCap}.`);
    setTargetError('');
    patch({ weeklyHoursTarget: value });
  };

  return (
    <section aria-labelledby="dept-title" className={`${card} p-4 text-sm text-slate-900`}>
      <h2 id="dept-title" className="text-base font-semibold text-slate-900">
        Setor e regras
      </h2>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="dept-active" className={labelCls}>
            Setor ativo
          </label>
          <div className="flex items-center gap-2">
            <select
              id="dept-active"
              className={input}
              value={department?.id ?? ''}
              onChange={(e) => {
                setActiveDepartment(e.target.value);
                setRenaming(false);
                setConfirmRemove(false);
                resetTargetEditing();
              }}
              disabled={!departments.length}
            >
              {!departments.length && <option value="">Nenhum setor</option>}
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            {department && (
              <>
                <button
                  type="button"
                  className={btnIcon}
                  aria-label={`Renomear setor ${department.name}`}
                  onClick={() => {
                    setRenameValue(department.name);
                    setRenaming(true);
                    setConfirmRemove(false);
                  }}
                >
                  <Pencil size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={btnIcon}
                  aria-label={`Remover setor ${department.name}`}
                  onClick={() => {
                    setConfirmRemove(true);
                    setRenaming(false);
                  }}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </div>

        <form onSubmit={create} noValidate>
          <label htmlFor="dept-new" className={labelCls}>
            Novo setor
          </label>
          <div className="flex items-center gap-2">
            <input
              id="dept-new"
              className={input}
              value={newName}
              placeholder="Ex.: Açougue, Frente de Caixa, Padaria"
              aria-invalid={createError ? 'true' : undefined}
              aria-describedby={createError ? 'dept-new-error' : undefined}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button type="submit" className={btnPrimary}>
              <Plus size={16} aria-hidden="true" />
              Criar setor
            </button>
          </div>
          {createError && (
            <p id="dept-new-error" role="alert" className={errorCls}>
              {createError}
            </p>
          )}
        </form>
      </div>

      {renaming && department && (
        <form onSubmit={saveRename} className="mt-3 flex items-end gap-2" noValidate>
          <div className="flex-1">
            <label htmlFor="dept-rename" className={labelCls}>
              Novo nome do setor
            </label>
            <input id="dept-rename" className={input} value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
          </div>
          <button type="submit" className={btnPrimary}>
            <Check size={16} aria-hidden="true" />
            Salvar nome
          </button>
          <button type="button" className={btnIcon} aria-label="Cancelar renomeação" onClick={() => setRenaming(false)}>
            <X size={16} aria-hidden="true" />
          </button>
        </form>
      )}

      {confirmRemove && department && (
        <div role="alertdialog" aria-label="Confirmar remoção do setor" className="mt-3 rounded-lg border border-rose-300 bg-rose-50 p-3">
          <p className="text-sm text-rose-900">
            Remover o setor <strong>{department.name}</strong>? Equipe, turnos, cobertura e escalas dele também serão apagados.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className={btnDanger}
              onClick={() => {
                removeDepartment(department.id);
                setConfirmRemove(false);
              }}
            >
              Confirmar remoção
            </button>
            <button type="button" className={btnGhost} onClick={() => setConfirmRemove(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {!department ? (
        <p className="mt-4 text-sm text-slate-600">Crie o primeiro setor para configurar regras, turnos e cobertura.</p>
      ) : (
        <div className="mt-4 grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
          <div>
            <label htmlFor="dept-sunday" className={labelCls}>
              Regra de domingo
            </label>
            <select id="dept-sunday" className={input} value={rule} aria-describedby="dept-sunday-help" onChange={(e) => patch({ defaultSundayRule: e.target.value })}>
              <option value="1_IN_3">1 em 3</option>
              <option value="1_IN_2">1 em 2</option>
              <option value="CUSTOM">Personalizada</option>
            </select>
            <p id="dept-sunday-help" className={hintCls}>
              {SUNDAY_HELP[rule]}
            </p>
          </div>

          <div>
            <label htmlFor="dept-target" className={labelCls}>
              Meta semanal
            </label>
            <select
              id="dept-target"
              className={input}
              value={targetSelect}
              aria-describedby="dept-target-help"
              onChange={(e) => {
                if (e.target.value === 'custom') {
                  setCustomMode(true);
                } else {
                  resetTargetEditing();
                  patch({ weeklyHoursTarget: Number(e.target.value) });
                }
              }}
            >
              {PRESET_TARGETS.map(({ hours, label }) => (
                <option key={hours} value={String(hours)} disabled={hours > legalCap}>
                  {label}
                </option>
              ))}
              <option value="custom">Personalizada</option>
            </select>
            {targetSelect === 'custom' && (
              <div className="mt-2">
                <label htmlFor="dept-target-custom" className={labelCls}>
                  Meta personalizada (horas por semana)
                </label>
                <input
                  id="dept-target-custom"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max={String(legalCap)}
                  step="1"
                  className={input}
                  value={targetDraft ?? (Number.isFinite(target) ? target : '')}
                  aria-invalid={targetError ? 'true' : undefined}
                  aria-describedby={targetError ? 'dept-target-error' : 'dept-target-help'}
                  onChange={(e) => changeCustomTarget(e.target.value)}
                />
                {targetError && (
                  <p id="dept-target-error" role="alert" className={errorCls}>
                    {targetError}
                  </p>
                )}
              </div>
            )}
            <p id="dept-target-help" className={hintCls} data-testid="legal-cap">
              {describeLegalWeeklyCap(today)}
            </p>
            {targetOverCap && (
              <p className={errorCls} data-testid="target-over-cap">
                A meta gravada ({target}h) está acima do teto legal de {legalCap}h; a validação usa {legalCap}h.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="dept-break" className={labelCls}>
              Intervalo mínimo (turnos acima de 6h)
            </label>
            <select id="dept-break" className={input} value={String(minBreak)} aria-describedby="dept-break-help" onChange={(e) => patch({ minBreakMinutes: Number(e.target.value) })}>
              <option value="60">60 minutos (padrão, art. 71 CLT)</option>
              <option value="30">30 minutos (com convenção coletiva)</option>
            </select>
            <p id="dept-break-help" className={hintCls}>
              Use 30 minutos somente se houver convenção ou acordo coletivo (art. 611-A, III).
            </p>
          </div>

          <div>
            <label htmlFor="dept-offset" className={labelCls}>
              Deslocamento do ciclo de domingo
            </label>
            <select id="dept-offset" className={input} value={String(offset)} aria-describedby="dept-offset-help" onChange={(e) => patch({ sundayCycleOffset: Number(e.target.value) })}>
              <option value="0">0 - ciclo padrão</option>
              <option value="1">1 - deslocar o ciclo em 1 semana</option>
              <option value="2">2 - deslocar o ciclo em 2 semanas</option>
            </select>
            <p id="dept-offset-help" className={hintCls}>
              Alinhar com o rodízio atual da loja: escolha o valor que faz o grupo certo folgar no domingo da semana corrente.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
