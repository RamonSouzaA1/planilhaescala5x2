import { useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { useScheduleStore } from '../../store/useScheduleStore.js';
import { Modal, btnDanger, btnPrimary, btnSecondary } from '../team/Modal.jsx';
import { PRIVACY_EMAIL, downloadJson, exportFilename } from './localData.js';

/**
 * Botão que baixa todos os dados locais em JSON.
 * @param {{ className?: string, onDone?: (message: string) => void }} props
 */
export function ExportDataButton({ className = btnSecondary, onDone }) {
  const handleClick = () => {
    try {
      downloadJson(exportFilename(), useScheduleStore.getState().exportLocalData());
      onDone?.('Arquivo gerado. Guarde-o em um lugar seguro.');
    } catch (error) {
      console.error('Falha ao exportar dados', error);
      onDone?.('Não foi possível gerar o arquivo de exportação.');
    }
  };
  return (
    <button type="button" className={className} onClick={handleClick}>
      <Download size={16} aria-hidden="true" />
      Exportar meus dados
    </button>
  );
}

/**
 * Janela "Privacidade": o que o app guarda, onde, para quê, como exportar e apagar.
 * @param {{ onClose: () => void }} props
 */
export function PrivacyModal({ onClose }) {
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState('');

  const wipe = () => {
    useScheduleStore.getState().wipeLocalData();
    setConfirming(false);
    setMessage('Pronto: os dados deste navegador foram apagados.');
  };

  return (
    <Modal
      title="Privacidade"
      onClose={onClose}
      footer={
        <button type="button" className={btnPrimary} onClick={onClose}>
          Fechar
        </button>
      }
    >
      <div className="space-y-3 text-slate-700">
        <section aria-labelledby="priv-what">
          <h3 id="priv-what" className="font-semibold text-slate-900">
            O que guardamos
          </h3>
          <p>
            Nome, função, tags e, se você informar, telefone dos funcionários, além da escala, dos turnos e das ausências do
            setor. Não pedimos CPF nem outros documentos.
          </p>
        </section>
        <section aria-labelledby="priv-where">
          <h3 id="priv-where" className="font-semibold text-slate-900">
            Onde ficam
          </h3>
          <p>Somente neste navegador, neste aparelho. Nesta versão nada é enviado para um servidor.</p>
        </section>
        <section aria-labelledby="priv-why">
          <h3 id="priv-why" className="font-semibold text-slate-900">
            Para quê
          </h3>
          <p>Para montar, validar e exibir a escala. O telefone é opcional e usado só para enviar a escala pelo WhatsApp.</p>
        </section>
        <section aria-labelledby="priv-rights">
          <h3 id="priv-rights" className="font-semibold text-slate-900">
            Exportar e apagar
          </h3>
          <p>Você pode baixar uma cópia dos dados ou apagar tudo a qualquer momento, pelos botões abaixo.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <ExportDataButton onDone={setMessage} />
            {!confirming && (
              <button type="button" className={btnSecondary} onClick={() => setConfirming(true)}>
                <Trash2 size={16} aria-hidden="true" />
                Apagar todos os dados deste navegador
              </button>
            )}
          </div>
          {confirming && (
            <div role="alert" className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-3">
              <p className="font-medium text-rose-900">
                Isso apaga a equipe, os turnos e todas as escalas salvas neste navegador. Não dá para desfazer.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className={btnDanger} onClick={wipe}>
                  Sim, apagar tudo
                </button>
                <button type="button" className={btnSecondary} onClick={() => setConfirming(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {message && (
            <p role="status" className="mt-2 text-xs font-medium text-slate-700">
              {message}
            </p>
          )}
        </section>
        <section aria-labelledby="priv-contact">
          <h3 id="priv-contact" className="font-semibold text-slate-900">
            Contato
          </h3>
          <p>
            Dúvidas sobre seus dados:{' '}
            <a className="font-medium text-emerald-700 underline" href={`mailto:${PRIVACY_EMAIL}`}>
              {PRIVACY_EMAIL}
            </a>
          </p>
        </section>
      </div>
    </Modal>
  );
}
