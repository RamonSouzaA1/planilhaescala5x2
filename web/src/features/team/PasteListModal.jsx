import { useId, useMemo, useState } from 'react';
import { useScheduleStore } from '../../store/useScheduleStore.js';
import { parseEmployeeListDetailed } from '../../store/parseEmployeeList.js';
import { Modal, btnPrimary, btnSecondary, inputCls } from './Modal.jsx';

/**
 * Modal "Colar Lista de Nomes" (WhatsApp/Excel) com pré-visualização ao vivo.
 * @param {{ onClose: () => void }} props
 */
export function PasteListModal({ onClose }) {
  const uid = useId();
  const [text, setText] = useState('');
  const { people, ignoredCpfCount } = useMemo(() => parseEmployeeListDetailed(text), [text]);

  const confirm = () => {
    if (!people.length) return;
    useScheduleStore.getState().addEmployeesBulk(people);
    onClose();
  };

  return (
    <Modal
      title="Colar Lista de Nomes"
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className={btnPrimary} disabled={!people.length} onClick={confirm}>
            {people.length ? `Adicionar ${people.length} ${people.length === 1 ? 'pessoa' : 'pessoas'}` : 'Adicionar'}
          </button>
        </>
      }
    >
      <label htmlFor={`${uid}-text`} className="mb-1 block text-xs font-medium text-slate-700">
        Lista de nomes
      </label>
      <textarea
        id={`${uid}-text`}
        data-autofocus
        rows={7}
        className={inputCls}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'Uma pessoa por linha. Função e telefone são opcionais:\n1. Ana Souza - Caixa\n2. Bruno Lima; Fiscal; (11) 91234-5678'}
      />
      <p role="status" className="mt-2 text-sm font-medium text-slate-800">
        {people.length === 0
          ? 'Nenhuma pessoa reconhecida ainda.'
          : `${people.length} ${people.length === 1 ? 'pessoa reconhecida' : 'pessoas reconhecidas'}`}
      </p>
      {ignoredCpfCount > 0 && (
        <p role="status" data-testid="cpf-warning" className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
          {ignoredCpfCount === 1
            ? 'Ignoramos 1 número que parece CPF — não precisamos dele.'
            : `Ignoramos ${ignoredCpfCount} números que parecem CPF — não precisamos deles.`}
        </p>
      )}
      {people.length > 0 && (
        <ul aria-label="Pré-visualização" className="mt-2 max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
          {people.slice(0, 100).map((p, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-2 px-3 py-1.5">
              <span className="font-medium text-slate-900">{p.name}</span>
              {p.roleTitle && <span className="text-slate-600">{p.roleTitle}</span>}
              {p.phone && <span className="text-xs text-slate-600">{p.phone}</span>}
            </li>
          ))}
          {people.length > 100 && <li className="px-3 py-1.5 text-xs text-slate-600">… e mais {people.length - 100}</li>}
        </ul>
      )}
    </Modal>
  );
}
