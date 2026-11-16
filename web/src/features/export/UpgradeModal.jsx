import { useState } from 'react';
import { Check, Clock, Crown, Download } from 'lucide-react';
import { Dialog, btnPrimary, btnSecondary, cardCls } from './Dialog.jsx';

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

/**
 * Modal de Desbloqueio Imediato (spec 6.3). O checkout Pix ainda não existe: escolher um plano
 * só informa isso com honestidade. Nenhum dado é coletado e nenhuma cobrança é feita.
 * @param {{ employeeCount: number, hasRedAlerts?: boolean, reason?: string, onClose: () => void }} props
 */
export function UpgradeModal({ employeeCount, hasRedAlerts = false, reason, onClose }) {
  const [chosen, setChosen] = useState(null);

  const intro = hasRedAlerts
    ? `Sua escala de ${employeeCount} funcionários está pronta.`
    : `Sua escala de ${employeeCount} funcionários está pronta e 100% dentro da CLT.`;

  if (chosen) {
    return (
      // key: remonta o diálogo para o foco ir ao botão principal (o botão clicado some da tela).
      <Dialog key="pix-unavailable" title="Pagamento via Pix indisponível" onClose={onClose}>
        <p className="text-slate-700">
          Pagamento via Pix ainda não está disponível. Obrigado pelo interesse! Nenhuma cobrança foi feita.
        </p>
        <p className="mt-1 text-xs text-slate-600">
          Plano escolhido: <strong>{chosen.name}</strong> ({chosen.price})
        </p>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={() => setChosen(null)}>
            Voltar
          </button>
          <button type="button" data-autofocus className={btnPrimary} onClick={onClose}>
            Entendi
          </button>
        </div>
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
