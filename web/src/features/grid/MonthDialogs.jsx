import { Modal, btnDanger, btnPrimary, btnSecondary } from '../team/Modal.jsx';
import { describeMonthWeeks, monthName } from './monthUtils.js';

/** Confirmação antes de gerar o mês: diz quantas semanas e quais dias serão substituídos. */
export function GenerateMonthDialog({ monthKey, weeks, onConfirm, onCancel }) {
  const { count, range, outside } = describeMonthWeeks(monthKey, weeks);
  return (
    <Modal
      title="Gerar mês?"
      onClose={onCancel}
      footer={
        <>
          <button type="button" className={btnSecondary} onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className={btnPrimary} onClick={onConfirm} data-autofocus>
            Gerar mês
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-700">
        Vamos gerar a escala das {count} semanas que tocam {monthName(monthKey)} ({range}). As células não travadas dessas semanas serão substituídas
        {outside ? `, inclusive dias de ${outside}` : ''}. Células travadas e ausências são mantidas.
      </p>
    </Modal>
  );
}

/** Confirmação antes de limpar o mês (apaga também as células travadas). */
export function ClearMonthDialog({ monthKey, weeks, onConfirm, onCancel }) {
  const { count, range } = describeMonthWeeks(monthKey, weeks);
  return (
    <Modal
      title="Limpar mês?"
      onClose={onCancel}
      footer={
        <>
          <button type="button" className={btnSecondary} onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className={btnDanger} onClick={onConfirm}>
            Confirmar limpeza
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-700">
        Todas as células das {count} semanas que tocam {monthName(monthKey)} ({range}) deste setor serão apagadas, inclusive as travadas. Você pode desfazer com Ctrl+Z.
      </p>
    </Modal>
  );
}
