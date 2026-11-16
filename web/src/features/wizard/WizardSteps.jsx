import { useId } from 'react';
import { Check, TriangleAlert } from 'lucide-react';
import { inputCls, btnPrimary, btnSecondary } from '../team/Modal.jsx';
import { formatMinutes, getClockMinutes } from '../shifts/shiftMetrics.js';

const labelCls = 'mb-1 block text-xs font-medium text-slate-700';
const hintCls = 'mt-1 text-xs text-slate-600';
const errorCls = 'mt-1 text-xs font-medium text-rose-700';

export const TARGET_OPTIONS = [42, 40];

/** Bloco recolhido por padrão para campos que quase ninguém precisa mexer. */
function Advanced({ children }) {
  return (
    <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium text-slate-700 focus-visible:outline-2 focus-visible:outline-emerald-600">
        Opções avançadas
      </summary>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </details>
  );
}

function StepTitle({ title, children }) {
  return (
    <>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mb-3 mt-1 text-sm text-slate-600">{children}</p>
    </>
  );
}

/** Passo 1: nome do setor e meta semanal. `draft`: { name, target, sundayRule, cycleOffset, minBreak }. */
export function StepSector({ draft, onChange, error }) {
  const uid = useId();
  const targets = TARGET_OPTIONS.includes(draft.target) ? TARGET_OPTIONS : [...TARGET_OPTIONS, draft.target];
  return (
    <div>
      <StepTitle title="Qual é o setor?">Informe o nome e quantas horas por semana cada pessoa deve cumprir.</StepTitle>
      <label htmlFor={`${uid}-name`} className={labelCls}>
        Nome do setor
      </label>
      <input
        id={`${uid}-name`}
        data-autofocus
        className={inputCls}
        value={draft.name}
        placeholder="Ex.: Açougue"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${uid}-err` : undefined}
        onChange={(e) => onChange({ name: e.target.value })}
      />
      {error && (
        <p id={`${uid}-err`} role="alert" className={errorCls}>
          {error}
        </p>
      )}
      <fieldset className="mt-4">
        <legend className={labelCls}>Meta de horas por semana</legend>
        <div className="grid grid-cols-2 gap-2">
          {targets.map((t) => (
            <label
              key={t}
              className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium ${
                draft.target === t ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-800'
              }`}
            >
              <input type="radio" name={`${uid}-target`} checked={draft.target === t} onChange={() => onChange({ target: t })} />
              {t}h por semana
            </label>
          ))}
        </div>
        <p className={hintCls}>42h vale a partir de dezembro de 2026 e 40h a partir de dezembro de 2027.</p>
      </fieldset>
      <Advanced>
        <div>
          <label htmlFor={`${uid}-sunday`} className={labelCls}>
            Regra de domingo
          </label>
          <select id={`${uid}-sunday`} className={inputCls} value={draft.sundayRule} onChange={(e) => onChange({ sundayRule: e.target.value })}>
            <option value="1_IN_3">Trabalha 1 domingo a cada 3</option>
            <option value="1_IN_2">Trabalha 1 domingo a cada 2</option>
            <option value="CUSTOM">Personalizada (definida por pessoa)</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${uid}-offset`} className={labelCls}>
            Ciclo de domingo
          </label>
          <select id={`${uid}-offset`} className={inputCls} value={String(draft.cycleOffset)} onChange={(e) => onChange({ cycleOffset: Number(e.target.value) })}>
            <option value="0">Ciclo padrão</option>
            <option value="1">Deslocar o ciclo em 1 semana</option>
            <option value="2">Deslocar o ciclo em 2 semanas</option>
          </select>
          <p className={hintCls}>Use se a loja já está no meio do rodízio de domingos.</p>
        </div>
        <div>
          <label htmlFor={`${uid}-break`} className={labelCls}>
            Intervalo de almoço
          </label>
          <select id={`${uid}-break`} className={inputCls} value={String(draft.minBreak)} onChange={(e) => onChange({ minBreak: Number(e.target.value) })}>
            <option value="60">60 minutos (padrão da CLT)</option>
            <option value="30">30 minutos (só com convenção coletiva)</option>
          </select>
        </div>
      </Advanced>
    </div>
  );
}

/** Passo 2: equipe. */
export function StepTeam({ existing, pasteText, onPasteText, people, canUseSample, onUseSample }) {
  const uid = useId();
  return (
    <div>
      <StepTitle title="Quem trabalha neste setor?">Cole a lista de nomes (do WhatsApp ou de uma planilha), uma pessoa por linha.</StepTitle>
      {existing.length > 0 && (
        <p className="mb-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-800" data-testid="wizard-existing-team">
          Já cadastradas: {existing.length} {existing.length === 1 ? 'pessoa' : 'pessoas'}. O que você colar abaixo será somado à equipe.
        </p>
      )}
      <label htmlFor={`${uid}-text`} className={labelCls}>
        Lista de nomes
      </label>
      <textarea
        id={`${uid}-text`}
        data-autofocus
        rows={6}
        className={inputCls}
        value={pasteText}
        onChange={(e) => onPasteText(e.target.value)}
        placeholder={'Ana Souza\nBruno Lima\nCarla Dias'}
      />
      <p role="status" className="mt-2 text-sm font-medium text-slate-800">
        {people.length === 0
          ? 'Nenhuma pessoa reconhecida ainda.'
          : `${people.length} ${people.length === 1 ? 'pessoa reconhecida' : 'pessoas reconhecidas'}`}
      </p>
      {people.length > 0 && (
        <ul aria-label="Pré-visualização" className="mt-2 max-h-40 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
          {people.slice(0, 100).map((p, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-2 px-3 py-1.5">
              <span className="font-medium text-slate-900">{p.name}</span>
              {p.roleTitle && <span className="text-slate-600">{p.roleTitle}</span>}
            </li>
          ))}
        </ul>
      )}
      {canUseSample && (
        <div className="mt-4 rounded-xl border border-slate-200 p-3">
          <p className="mb-2 text-sm text-slate-700">Só quer testar? A Loja Exemplo traz 26 pessoas, turnos e regras prontos.</p>
          <button type="button" className={btnSecondary} onClick={onUseSample}>
            Usar Loja Exemplo
          </button>
        </div>
      )}
      <Advanced>
        <p className="text-sm text-slate-700">
          Restrições de cada pessoa (dias ou turnos em que ela não pode trabalhar, regra de domingo própria) ficam na aba Equipe, no cadastro da pessoa.
          Você pode configurá-las depois que a primeira escala estiver pronta.
        </p>
      </Advanced>
    </div>
  );
}

/** Passo 3: turnos. */
export function StepShifts({ shifts, onUseDefaults, onTimeChange }) {
  const uid = useId();
  return (
    <div>
      <StepTitle title="Quais são os horários?">Os turnos padrão do varejo funcionam para a maioria das lojas. Você pode ajustar os horários depois.</StepTitle>
      {shifts.length === 0 && (
        <>
          <button type="button" data-autofocus className={`${btnPrimary} w-full py-3 text-base`} onClick={onUseDefaults}>
            Usar turnos padrão do varejo
          </button>
          <p className={hintCls}>Cria 3 turnos de 8h24: abertura, intermediário e fechamento.</p>
        </>
      )}
      {shifts.length > 0 && (
        <ul aria-label="Turnos do setor" className="flex flex-col gap-2">
          {shifts.map((s, i) => {
            const clock = getClockMinutes(s.startTime, s.endTime);
            return (
              <li key={s.id} className="rounded-xl border border-slate-200 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="font-medium text-slate-900">
                    {s.code} · {s.name}
                  </span>
                  {clock !== null && <span className="ml-auto text-xs text-slate-600">{formatMinutes(clock)} no relógio</span>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor={`${uid}-s${i}`} className={labelCls}>
                      Início de {s.code}
                    </label>
                    <input
                      id={`${uid}-s${i}`}
                      data-autofocus={i === 0 ? true : undefined}
                      type="time"
                      className={inputCls}
                      value={s.startTime}
                      onChange={(e) => onTimeChange(s, { startTime: e.target.value })}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${uid}-e${i}`} className={labelCls}>
                      Fim de {s.code}
                    </label>
                    <input id={`${uid}-e${i}`} type="time" className={inputCls} value={s.endTime} onChange={(e) => onTimeChange(s, { endTime: e.target.value })} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Advanced>
        <p className="text-sm text-slate-700">Para criar turnos extras, mudar o intervalo ou as cores, use a aba Turnos e Cobertura depois do guia.</p>
      </Advanced>
    </div>
  );
}

/** Passo 4: cobertura mínima. */
export function StepCoverage({ value, onChange, error }) {
  const uid = useId();
  return (
    <div>
      <StepTitle title="Quantas pessoas no mínimo por dia?">
        Opcional. Se informar, a escala tenta manter esse mínimo de pessoas trabalhando em todos os dias da semana.
      </StepTitle>
      <label htmlFor={`${uid}-min`} className={labelCls}>
        Mínimo de pessoas por dia
      </label>
      <input
        id={`${uid}-min`}
        data-autofocus
        type="number"
        inputMode="numeric"
        min="0"
        className={inputCls}
        value={value}
        placeholder="Deixe em branco para não exigir"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${uid}-err` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && (
        <p id={`${uid}-err`} role="alert" className={errorCls}>
          {error}
        </p>
      )}
      <Advanced>
        <p className="text-sm text-slate-700">Mínimo diferente em cada dia, exigência por função (tags) e horários de pico ficam na aba Turnos e Cobertura.</p>
      </Advanced>
    </div>
  );
}

/** Passo 5: resultado da primeira escala. */
export function StepReady({ result, problem }) {
  if (problem) {
    return (
      <div>
        <StepTitle title="Quase lá">Ainda não deu para gerar a escala.</StepTitle>
        <p role="status" className="flex items-start gap-2 rounded-xl border border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">
          <TriangleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          {problem}
        </p>
      </div>
    );
  }
  const green = result?.status === 'GREEN';
  const total = result?.summary?.total ?? 0;
  return (
    <div>
      <StepTitle title="Tudo pronto!">Geramos a primeira escala da semana. Você pode ajustar qualquer célula na grade.</StepTitle>
      <p
        data-testid="wizard-seal"
        data-status={result?.status ?? 'NONE'}
        role="status"
        className={`flex items-center gap-2 rounded-xl border p-3 text-sm font-medium ${
          green ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-amber-500 bg-amber-50 text-amber-900'
        }`}
      >
        {green ? <Check size={16} aria-hidden="true" /> : <TriangleAlert size={16} aria-hidden="true" />}
        {green ? 'Escala 100% dentro da CLT' : `${total} ${total === 1 ? 'alerta' : 'alertas'} para revisar na grade`}
      </p>
    </div>
  );
}
