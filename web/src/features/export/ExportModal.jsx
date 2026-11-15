import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, Image as ImageIcon, Lock, MessageCircle, Send } from 'lucide-react';
import QRCode from 'qrcode';
import { getEffectivePlan, getPlanLimits, shouldShowWatermark } from '@escala/shared/utils/planPermissions.js';
import { useScheduleStore } from '../../store/useScheduleStore.js';
import {
  selectActiveDepartment,
  selectDepartmentEmployees,
  selectDepartmentShifts,
  selectWeekAssignments,
  selectWeekValidation,
} from '../../store/selectors.js';
import { Dialog, btnPrimary, btnSecondary, cardCls } from './Dialog.jsx';
import { ExportTable, EXPORT_TABLE_WIDTH } from './ExportTable.jsx';
import { UpgradeModal } from './UpgradeModal.jsx';
import { exportFileName, exportNodeToPng } from './exportImage.js';
import { SITE_URL, buildEmployeeMessage, buildTeamSummary, weekRangeLabel, whatsappShareUrl } from './whatsappText.js';

const PLAN_LABEL = {
  FREE: 'Gratuito',
  LEADER_MONTHLY: 'Plano Líder',
  TRANSITION_PASS: 'Passe Transição',
  STORE_MULTI: 'Plano Loja',
  ENTERPRISE: 'Redes',
};

const TABS = [
  { id: 'image', label: 'Imagem (PNG)' },
  { id: 'text', label: 'Texto para o grupo' },
  { id: 'individual', label: 'Mensagens individuais' },
];

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // cai no fallback abaixo
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand?.('copy') ?? false;
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

function openWhatsapp(url) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Exportação da semana atual do setor ativo: imagem PNG, texto para o grupo e mensagens
 * individuais, com o paywall da spec 6.3.
 * @param {{ onClose: () => void }} props
 */
export function ExportModal({ onClose }) {
  const organization = useScheduleStore((s) => s.organization);
  const department = useScheduleStore(selectActiveDepartment);
  const employees = useScheduleStore((s) => selectDepartmentEmployees(s, { activeOnly: true }));
  const shifts = useScheduleStore(selectDepartmentShifts);
  const assignments = useScheduleStore(selectWeekAssignments);
  const validation = useScheduleStore(selectWeekValidation);
  const weekStartDate = useScheduleStore((s) => s.currentWeekStart);

  const plan = getEffectivePlan(organization);
  const limits = getPlanLimits(plan);
  const watermark = shouldShowWatermark(plan);
  const count = employees.length;
  const overFreeLimit = watermark && count > limits.maxEmployeesPerDept;
  const hasRedAlerts = (validation?.summary.red ?? 0) > 0;
  const hasSchedule = assignments.length > 0;
  const lockReason = `Plano ${PLAN_LABEL[plan]}: acima de ${limits.maxEmployeesPerDept} funcionários, imagem limpa, texto do grupo e mensagens individuais pedem plano pago.`;

  const [tab, setTab] = useState('image');
  const [upgrade, setUpgrade] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [copiedKey, setCopiedKey] = useState(null);
  const exportRef = useRef(null);
  const upgradeOpen = useRef(false);
  const tabRefs = useRef({});

  useEffect(() => {
    upgradeOpen.current = upgrade;
  });

  useEffect(() => {
    if (!watermark) return undefined;
    let cancelled = false;
    Promise.resolve()
      .then(() => QRCode.toDataURL(SITE_URL, { margin: 1, width: 176 }))
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [watermark]);

  const common = { department, weekStartDate, shifts, assignments, plan };
  const summary = buildTeamSummary({ ...common, employees });
  const lockedPreview = `${summary.split('\n').slice(0, 7).join('\n')}\n…`;

  async function downloadImage() {
    if (!exportRef.current || busy) return;
    setBusy(true);
    setMessage('');
    try {
      await exportNodeToPng(exportRef.current, exportFileName(department?.name, weekStartDate));
      setMessage('Imagem baixada.');
    } catch {
      setMessage('Não foi possível gerar a imagem. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  async function copy(key, text) {
    if (overFreeLimit) return setUpgrade(true);
    const ok = await copyToClipboard(text);
    setCopiedKey(ok ? key : null);
    setMessage(ok ? 'Copiado!' : 'Não foi possível copiar. Selecione o texto e copie manualmente.');
    if (ok) setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
  }

  function send(text, phone) {
    if (overFreeLimit) return setUpgrade(true);
    openWhatsapp(whatsappShareUrl(text, phone));
  }

  function onTabKeyDown(event, index) {
    const last = TABS.length - 1;
    const next =
      event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : null;
    if (next === null) return;
    event.preventDefault();
    setTab(TABS[next].id);
    tabRefs.current[TABS[next].id]?.focus();
  }

  const tableProps = { department, weekStartDate, employees, shifts, assignments, watermark, qrDataUrl };

  return (
    <>
      <Dialog
        title="Exportar escala"
        size="xl"
        onClose={() => {
          if (!upgradeOpen.current) onClose();
        }}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <span>
            {department?.name ?? 'Sem setor'} — semana {weekRangeLabel(weekStartDate)} — {count} funcionários
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5" data-testid="plan-badge">
            Plano atual: {PLAN_LABEL[plan]}
          </span>
        </div>

        {overFreeLimit && (
          <p className="mb-3 flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <Lock size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            {lockReason}
          </p>
        )}
        {!hasSchedule && (
          <p role="status" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Esta semana ainda não tem escala. Gere ou monte a escala na grade antes de exportar.
          </p>
        )}

        <div role="tablist" aria-label="Formato de exportação" className="mb-3 flex gap-1 border-b border-slate-200">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`export-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`export-panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              data-autofocus={tab === t.id ? '' : undefined}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => onTabKeyDown(e, i)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                tab === t.id ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`export-panel-${tab}`} aria-labelledby={`export-tab-${tab}`}>
          {tab === 'image' && (
            <div>
              <div
                role="img"
                aria-label="Pré-visualização reduzida da escala"
                className={`${cardCls} max-h-72 overflow-auto bg-slate-50 p-2`}
              >
                <div style={{ zoom: 0.5, width: EXPORT_TABLE_WIDTH }} aria-hidden="true">
                  <ExportTable {...tableProps} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {watermark ? (
                  <>
                    <button type="button" className={btnPrimary} onClick={downloadImage} disabled={!hasSchedule || busy}>
                      <Download size={16} aria-hidden="true" /> Baixar imagem com marca d&apos;água
                    </button>
                    {overFreeLimit && (
                      <button type="button" className={btnSecondary} onClick={() => setUpgrade(true)}>
                        <Lock size={16} aria-hidden="true" /> Baixar imagem sem marca d&apos;água
                      </button>
                    )}
                  </>
                ) : (
                  <button type="button" className={btnPrimary} onClick={downloadImage} disabled={!hasSchedule || busy}>
                    <Download size={16} aria-hidden="true" /> Baixar imagem
                  </button>
                )}
                <span className="text-xs text-slate-600">
                  {watermark
                    ? 'No plano gratuito a imagem leva marca d\'água e QR Code.'
                    : 'Imagem limpa, sem marca d\'água.'}
                </span>
              </div>
              {/* Cópia fora da tela, em tamanho real, usada para gerar o PNG. */}
              <div style={{ position: 'fixed', left: -100000, top: 0 }} aria-hidden="true">
                <div ref={exportRef}>
                  <ExportTable {...tableProps} />
                </div>
              </div>
            </div>
          )}

          {tab === 'text' && (
            <div>
              <label htmlFor="export-summary" className="mb-1 block text-xs font-medium text-slate-700">
                Resumo da semana para colar no grupo do WhatsApp
              </label>
              <textarea
                id="export-summary"
                readOnly
                rows={14}
                value={overFreeLimit ? lockedPreview : summary}
                className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2 font-mono text-xs text-slate-900"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" className={btnPrimary} onClick={() => copy('summary', summary)} disabled={!hasSchedule}>
                  {copiedKey === 'summary' ? <Check size={16} aria-hidden="true" /> : overFreeLimit ? <Lock size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                  {copiedKey === 'summary' ? 'Copiado!' : 'Copiar'}
                </button>
                <button type="button" className={btnSecondary} onClick={() => send(summary)} disabled={!hasSchedule}>
                  <MessageCircle size={16} aria-hidden="true" /> Abrir no WhatsApp
                </button>
              </div>
            </div>
          )}

          {tab === 'individual' && (
            <ul aria-label="Mensagens individuais" className="divide-y divide-slate-200 rounded-xl border border-slate-200">
              {employees.map((employee) => {
                const text = buildEmployeeMessage({ ...common, employee });
                const noPhone = !employee.phone;
                return (
                  <li key={employee.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="min-w-0 truncate font-medium text-slate-900">{employee.name}</span>
                    <span className="flex items-center gap-2">
                      <button
                        type="button"
                        className={btnSecondary}
                        aria-label={`Copiar mensagem de ${employee.name}`}
                        onClick={() => copy(employee.id, text)}
                        disabled={!hasSchedule}
                      >
                        {copiedKey === employee.id ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                        {copiedKey === employee.id ? 'Copiado!' : 'Copiar'}
                      </button>
                      <button
                        type="button"
                        className={btnSecondary}
                        aria-label={`Enviar mensagem para ${employee.name}`}
                        title={noPhone ? 'Cadastre o telefone do funcionário para enviar direto' : undefined}
                        onClick={() => send(text, employee.phone)}
                        disabled={noPhone || !hasSchedule}
                      >
                        <Send size={16} aria-hidden="true" /> Enviar
                      </button>
                      {noPhone && <span className="text-xs text-slate-600">Sem telefone cadastrado</span>}
                    </span>
                  </li>
                );
              })}
              {employees.length === 0 && <li className="px-3 py-3 text-slate-600">Nenhum funcionário ativo no setor.</li>}
            </ul>
          )}
        </div>

        <p role="status" aria-live="polite" className="mt-2 min-h-4 text-xs text-slate-700">
          {message}
        </p>
        <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
          <ImageIcon size={14} aria-hidden="true" /> Dica: no celular, mande a imagem direto no grupo da equipe.
        </p>
      </Dialog>

      {upgrade && (
        <UpgradeModal employeeCount={count} hasRedAlerts={hasRedAlerts} reason={lockReason} onClose={() => setUpgrade(false)} />
      )}
    </>
  );
}
