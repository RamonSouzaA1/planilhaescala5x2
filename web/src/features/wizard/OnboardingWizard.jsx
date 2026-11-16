import { useEffect, useMemo, useRef, useState } from 'react';
import { DAYS_OF_WEEK } from '@escala/shared/models/schemas.js';
import { useScheduleStore } from '../../store/useScheduleStore.js';
import { selectActiveDepartment, selectDepartmentCoverageRules, selectDepartmentEmployees, selectDepartmentShifts } from '../../store/selectors.js';
import { parseEmployeeList } from '../../store/parseEmployeeList.js';
import { Modal, btnPrimary, btnSecondary } from '../team/Modal.jsx';
import { DEFAULT_RETAIL_SHIFTS } from '../shifts/ShiftsEditor.jsx';
import { computeIsNight } from '../shifts/shiftMetrics.js';
import { StepCoverage, StepReady, StepSector, StepShifts, StepTeam } from './WizardSteps.jsx';

const STEP_COUNT = 5;
const LAST_STEP = STEP_COUNT - 1;
const TIME = /^\d{2}:\d{2}$/;

const store = () => useScheduleStore.getState();
const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Rascunho do passo 1 a partir do setor ativo (ou valores padrão se ainda não existe). */
function sectorDraftOf(department) {
  return {
    name: department?.name ?? '',
    target: Number(department?.weeklyHoursTarget) || 42,
    sundayRule: department?.defaultSundayRule ?? '1_IN_3',
    cycleOffset: department?.sundayCycleOffset ?? 0,
    minBreak: department?.minBreakMinutes ?? 60,
  };
}

/** Valor de "mínimo por dia" já existente, se os 7 dias têm o mesmo mínimo maior que zero. */
function sharedMinimum(rules) {
  const mins = DAYS_OF_WEEK.map((day) => rules.find((r) => r.dayOfWeek === day)?.minTotalStaff ?? 0);
  return mins[0] > 0 && mins.every((m) => m === mins[0]) ? String(mins[0]) : '';
}

/** Cria ou atualiza o setor ativo com o rascunho do passo 1 (nunca duplica). */
function saveSector(draft) {
  const data = {
    name: draft.name.trim(),
    weeklyHoursTarget: draft.target,
    defaultSundayRule: draft.sundayRule,
    sundayCycleOffset: draft.cycleOffset,
    minBreakMinutes: draft.minBreak,
  };
  const current = selectActiveDepartment(store());
  if (!current) return store().addDepartment(data);
  if (Object.entries(data).some(([key, value]) => current[key] !== value)) store().updateDepartment(current.id, data);
  return current.id;
}

/** Aplica o mesmo mínimo aos 7 dias, preservando tags e picos de cada regra existente. */
function saveCoverage(minimum) {
  const rules = selectDepartmentCoverageRules(store());
  for (const dayOfWeek of DAYS_OF_WEEK) {
    const existing = rules.find((r) => r.dayOfWeek === dayOfWeek);
    if (existing?.minTotalStaff === minimum) continue;
    store().upsertCoverageRule({ ...existing, dayOfWeek, minTotalStaff: minimum });
  }
}

/** Gera a semana atual. Devolve { result } ou { problem } com a explicação em português. */
function generateFirstSchedule() {
  const state = store();
  const people = selectDepartmentEmployees(state, { activeOnly: true });
  if (!selectActiveDepartment(state)) return { problem: 'Falta informar o setor. Volte ao primeiro passo.' };
  if (!people.length) return { problem: 'Falta cadastrar pelo menos uma pessoa na equipe.' };
  if (!selectDepartmentShifts(state).length) return { problem: 'Falta criar pelo menos um turno.' };
  try {
    return { result: store().generateWeek() };
  } catch {
    return { problem: 'Não foi possível gerar a escala com os dados atuais. Confira os turnos e tente de novo.' };
  }
}

/**
 * Assistente de primeiro uso: 5 passos curtos. Cada "Continuar" grava no store (atualiza o que já
 * existe em vez de duplicar), então pular ou fechar nunca perde o que já foi preenchido.
 * @param {{ onClose: () => void, onViewSchedule: () => void }} props
 */
export function OnboardingWizard({ onClose, onViewSchedule }) {
  const setOnboarding = useScheduleStore((s) => s.setOnboarding);
  const employees = useScheduleStore(selectDepartmentEmployees);
  const shifts = useScheduleStore(selectDepartmentShifts);

  const [step, setStep] = useState(0);
  const [sector, setSector] = useState(() => sectorDraftOf(selectActiveDepartment(store())));
  const [pasteText, setPasteText] = useState('');
  const [minimum, setMinimum] = useState(() => sharedMinimum(selectDepartmentCoverageRules(store())));
  const [errors, setErrors] = useState({});
  const [outcome, setOutcome] = useState({});
  const [confirmingSkip, setConfirmingSkip] = useState(false);
  const bodyRef = useRef(null);

  const people = useMemo(() => parseEmployeeList(pasteText), [pasteText]);
  const newPeople = useMemo(() => people.filter((p) => !employees.some((e) => sameName(e.name, p.name))), [people, employees]);
  const hasTeam = employees.length > 0 || newPeople.length > 0;

  // A cada passo, o foco vai para o primeiro campo dele.
  useEffect(() => {
    bodyRef.current?.querySelector('[data-autofocus]')?.focus();
  }, [step]);

  const finish = (status) => {
    setOnboarding(status);
    onClose();
  };

  const skipGuide = () => finish('skipped');
  const requestClose = () => setConfirmingSkip((open) => !open);

  const useSampleStore = () => {
    store().loadSampleStore();
    setSector(sectorDraftOf(selectActiveDepartment(store())));
    setMinimum(sharedMinimum(selectDepartmentCoverageRules(store())));
    setPasteText('');
  };

  const useDefaultShifts = () => {
    for (const shift of DEFAULT_RETAIL_SHIFTS) {
      if (shifts.some((s) => s.code === shift.code)) continue;
      store().addShift({ ...shift, isNightShift: computeIsNight(shift.startTime, shift.endTime) });
    }
  };

  const changeShiftTime = (shift, patch) => {
    const next = { ...shift, ...patch };
    if (!TIME.test(next.startTime) || !TIME.test(next.endTime) || next.startTime === next.endTime) return;
    store().updateShift(shift.id, { ...patch, isNightShift: computeIsNight(next.startTime, next.endTime) });
  };

  /** Valida e grava o passo atual. Devolve false se o usuário precisa corrigir algo. */
  const commitStep = () => {
    if (step === 0) {
      if (!sector.name.trim()) {
        setErrors({ sector: 'Informe o nome do setor.' });
        return false;
      }
      saveSector(sector);
    } else if (step === 1 && newPeople.length) {
      store().addEmployeesBulk(newPeople);
      setPasteText('');
    } else if (step === 3) {
      const raw = minimum.trim();
      if (raw !== '') {
        const value = Number(raw);
        const activeCount = selectDepartmentEmployees(store(), { activeOnly: true }).length;
        if (!Number.isInteger(value) || value < 0) {
          setErrors({ coverage: 'Use um número inteiro, como 4.' });
          return false;
        }
        if (activeCount > 0 && value > activeCount) {
          setErrors({ coverage: `São só ${activeCount} pessoas na equipe. Informe ${activeCount} ou menos.` });
          return false;
        }
        saveCoverage(value);
      }
      setOutcome(generateFirstSchedule());
    }
    setErrors({});
    return true;
  };

  const goNext = () => {
    if (commitStep()) setStep((s) => Math.min(s + 1, LAST_STEP));
  };
  const goBack = () => {
    setErrors({});
    setStep((s) => Math.max(s - 1, 0));
  };
  const viewSchedule = () => {
    setOnboarding('done');
    onViewSchedule();
  };

  const canContinue = step === 1 ? hasTeam : step === 2 ? shifts.length > 0 : true;
  const canSkipStep = (step === 1 || step === 2) && !canContinue;

  const footer = (
    <>
      <button type="button" className={`${btnSecondary} mr-auto`} onClick={skipGuide}>
        Pular, eu sei fazer
      </button>
      {step > 0 && (
        <button type="button" className={btnSecondary} onClick={goBack}>
          Voltar
        </button>
      )}
      {canSkipStep && (
        <button type="button" className={btnSecondary} onClick={goNext}>
          Pular este passo
        </button>
      )}
      {step < LAST_STEP ? (
        <button type="button" className={btnPrimary} disabled={!canContinue} onClick={goNext}>
          Continuar
        </button>
      ) : (
        <button type="button" className={btnPrimary} onClick={viewSchedule}>
          Ver minha escala
        </button>
      )}
    </>
  );

  return (
    <Modal title="Guia de configuração" onClose={requestClose} footer={footer}>
      <div ref={bodyRef}>
        <div className="mb-4">
          <p className="mb-1 text-xs font-medium text-slate-700">
            Passo {step + 1} de {STEP_COUNT}
          </p>
          <div
            role="progressbar"
            aria-label="Progresso do guia"
            aria-valuemin={1}
            aria-valuemax={STEP_COUNT}
            aria-valuenow={step + 1}
            className="h-2 overflow-hidden rounded-full bg-slate-200"
          >
            <div className="h-full rounded-full bg-emerald-600 transition-[width]" style={{ width: `${((step + 1) / STEP_COUNT) * 100}%` }} />
          </div>
        </div>

        {confirmingSkip && (
          <div role="alertdialog" aria-label="Confirmar saída do guia" className="mb-4 rounded-xl border border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="mb-2 font-medium">Pular o guia? O que você já preencheu fica salvo.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnPrimary} onClick={skipGuide}>
                Sim, pular o guia
              </button>
              <button type="button" data-autofocus className={btnSecondary} onClick={() => setConfirmingSkip(false)}>
                Continuar o guia
              </button>
            </div>
          </div>
        )}

        {step === 0 && <StepSector draft={sector} error={errors.sector} onChange={(patch) => setSector((d) => ({ ...d, ...patch }))} />}
        {step === 1 && (
          <StepTeam
            existing={employees}
            pasteText={pasteText}
            onPasteText={setPasteText}
            people={newPeople}
            canUseSample={employees.length === 0}
            onUseSample={useSampleStore}
          />
        )}
        {step === 2 && <StepShifts shifts={shifts} onUseDefaults={useDefaultShifts} onTimeChange={changeShiftTime} />}
        {step === 3 && <StepCoverage value={minimum} error={errors.coverage} onChange={setMinimum} />}
        {step === 4 && <StepReady result={outcome.result} problem={outcome.problem} />}
      </div>
    </Modal>
  );
}
