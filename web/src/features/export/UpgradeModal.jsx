import { useState } from 'react';
import { Check, Clock, Crown, Download } from 'lucide-react';
import { Dialog, btnPrimary, btnSecondary, cardCls } from './Dialog.jsx';

export const UPGRADE_INTEREST_KEY = 'planilha-escala-5x2:upgrade-interest';

const PLANS = [
  {
    id: 'LEADER_MONTHLY',
    name: 'Plano Líder',
    price: 'R$ 39,90/mês',
    action: 'Quero o Plano Líder',
    icon: Crown,
    benefits: [
      'Funcionários ilimitados em 1 seção',
      'Gerador automático 5x2 (42h e 40h)',
      'Exportação limpa: sem marca d\'água e sem QR Code',
      'Card individual e texto para o WhatsApp',
      'Histórico de semanas anteriores',
    ],
  },
  {
    id: 'TRANSITION_PASS',
    name: 'Passe Transição 45 Dias',
    price: 'R$ 59,90 no Pix',
    note: 'Sem mensalidade e sem cartão',
    action: 'Quero o Passe Transição',
    icon: Clock,
    benefits: [
      'Todos os recursos do Plano Líder por 45 dias corridos',
      'Pagamento único no Pix, sem renovação automática',
      'Ideal para resolver a migração 6x1 → 5x2 agora',
    ],
  },
];

function saveInterest(plan, phone) {
  try {
    localStorage.setItem(UPGRADE_INTEREST_KEY, JSON.stringify({ plan, phone, savedAt: new Date().toISOString() }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Modal de Desbloqueio Imediato (spec 6.3). O checkout Pix ainda não existe: os botões
 * coletam o WhatsApp de quem quer ser avisado. Nenhuma cobrança é feita.
 * @param {{ employeeCount: number, hasRedAlerts?: boolean, reason?: string, onClose: () => void }} props
 */
export function UpgradeModal({ employeeCount, hasRedAlerts = false, reason, onClose }) {
  const [chosen, setChosen] = useState(null);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const intro = hasRedAlerts
    ? `Sua escala de ${employeeCount} funcionários está pronta.`
    : `Sua escala de ${employeeCount} funcionários está pronta e 100% dentro da CLT.`;

  function submit(event) {
    event.preventDefault();
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      setError('Informe o WhatsApp com DDD, por exemplo (11) 91234-5678.');
      return;
    }
    if (!saveInterest(chosen.id, phone.trim())) {
      setError('Não foi possível salvar neste navegador. Tente novamente.');
      return;
    }
    setError('');
    setSaved(true);
  }

  if (chosen) {
    return (
      <Dialog title="Pagamento via Pix chega em breve" onClose={onClose}>
        <p className="text-slate-700">
          Pagamento via Pix chega em breve — deixe seu WhatsApp para ser avisado. Nenhuma cobrança foi feita.
        </p>
        <p className="mt-1 text-xs text-slate-600">
          Interesse: <strong>{chosen.name}</strong> ({chosen.price})
        </p>
        {saved ? (
          <p role="status" className="mt-3 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 font-medium text-emerald-800">
            <Check size={16} aria-hidden="true" /> Anotado! Avisaremos você no WhatsApp quando o Pix estiver disponível.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-3" noValidate>
            <label htmlFor="upgrade-phone" className="mb-1 block text-xs font-medium text-slate-700">
              Seu WhatsApp
            </label>
            <input
              id="upgrade-phone"
              data-autofocus
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 91234-5678"
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? 'upgrade-phone-error' : undefined}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
            />
            {error && (
              <p id="upgrade-phone-error" role="alert" className="mt-1 text-xs font-medium text-rose-700">
                {error}
              </p>
            )}
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button type="button" className={btnSecondary} onClick={() => setChosen(null)}>
                Voltar
              </button>
              <button type="submit" className={btnPrimary}>
                Avisar-me
              </button>
            </div>
          </form>
        )}
        {saved && (
          <div className="mt-3 flex justify-end">
            <button type="button" className={btnSecondary} onClick={onClose}>
              Fechar
            </button>
          </div>
        )}
      </Dialog>
    );
  }

  return (
    <Dialog title="Desbloqueie sua escala" onClose={onClose} size="lg">
      <p className="text-slate-800">
        {intro} Desbloqueie agora para imprimir sem marca d&apos;água e enviar no WhatsApp da equipe.
      </p>
      {reason && <p className="mt-1 text-xs text-slate-600">{reason}</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {PLANS.map((plan, i) => {
          const Icon = plan.icon;
          return (
            <section key={plan.id} aria-label={plan.name} className={`${cardCls} flex flex-col p-3 ${i === 0 ? 'ring-2 ring-emerald-600' : ''}`}>
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <Icon size={16} aria-hidden="true" /> {plan.name} ({plan.price})
              </h3>
              {plan.note && <p className="text-xs text-slate-600">{plan.note}</p>}
              <ul className="my-2 flex-1 space-y-1 text-xs text-slate-700">
                {plan.benefits.map((b) => (
                  <li key={b} className="flex gap-1.5">
                    <Check size={14} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
                    {b}
                  </li>
                ))}
              </ul>
              <button type="button" className={i === 0 ? btnPrimary : btnSecondary} onClick={() => setChosen(plan)}>
                {plan.action}
              </button>
            </section>
          );
        })}
      </div>
      <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-600">
        <Download size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        A imagem da escala com marca d&apos;água continua disponível grátis, sem limite.
      </p>
    </Dialog>
  );
}
