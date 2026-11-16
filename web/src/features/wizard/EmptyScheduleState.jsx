import { Sparkles } from 'lucide-react';
import { useScheduleStore } from '../../store/useScheduleStore.js';
import { btnPrimary, btnSecondary, cardCls } from '../team/Modal.jsx';

/**
 * Estado vazio da aba Escala (sem setor): o destaque é o guia; exemplo e "pular" são secundários.
 * @param {{ onStartGuide: () => void }} props
 */
export function EmptyScheduleState({ onStartGuide }) {
  const loadSampleStore = useScheduleStore((s) => s.loadSampleStore);
  const addDepartment = useScheduleStore((s) => s.addDepartment);
  const setOnboarding = useScheduleStore((s) => s.setOnboarding);

  const skipGuide = () => {
    addDepartment({ name: 'Meu Setor' });
    setOnboarding('skipped');
  };

  return (
    <div className={`${cardCls} mx-auto mt-4 max-w-lg p-6 text-center`}>
      <Sparkles size={20} aria-hidden="true" className="mx-auto mb-2 text-emerald-600" />
      <h2 className="mb-1 text-base font-semibold text-slate-900">Vamos montar sua escala</h2>
      <p className="mb-4 text-sm text-slate-600">Responda a poucas perguntas e a primeira escala sai pronta.</p>
      <button type="button" className={`${btnPrimary} w-full py-3 text-base sm:w-auto`} onClick={onStartGuide}>
        Começar guiado (2 minutos)
      </button>
      <div className="mt-3 flex flex-col items-center justify-center gap-2 sm:flex-row">
        <button type="button" className={btnSecondary} onClick={loadSampleStore}>
          Carregar Loja Exemplo
        </button>
        <button type="button" className={btnSecondary} onClick={skipGuide}>
          Pular guia
        </button>
      </div>
    </div>
  );
}
