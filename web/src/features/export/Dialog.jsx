import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Pilha de diálogos abertos: só o do topo reage a Esc e Tab (UpgradeModal sobre ExportModal). */
const openDialogs = [];

export const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
export const btnSecondary =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-50';
export const cardCls = 'rounded-xl border border-slate-200 bg-white shadow-sm';

/**
 * Diálogo modal acessível: role="dialog", aria-modal, foco inicial, Esc fecha (só o do topo),
 * Tab preso e foco devolvido a quem abriu.
 * @param {{ title: string, onClose: () => void, children: any, footer?: any, size?: 'md' | 'lg' | 'xl' }} props
 */
export function Dialog({ title, onClose, children, footer, size = 'md' }) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const [opener] = useState(() => (typeof document === 'undefined' ? null : document.activeElement));

  useEffect(() => {
    const dialog = dialogRef.current;
    openDialogs.push(dialog);
    const target = dialog.querySelector('[data-autofocus]') ?? dialog.querySelector(FOCUSABLE) ?? dialog;
    target.focus();
    const onKeyDown = (event) => {
      if (openDialogs[openDialogs.length - 1] !== dialog) return;
      if (event.key === 'Escape') {
        onCloseRef.current();
      } else if (event.key === 'Tab') {
        const items = [...dialog.querySelectorAll(FOCUSABLE)];
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const i = openDialogs.lastIndexOf(dialog);
      if (i >= 0) openDialogs.splice(i, 1);
      if (opener?.isConnected) opener.focus();
    };
  }, [opener]);

  const width = size === 'xl' ? 'sm:max-w-4xl' : size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg';
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`flex max-h-[92vh] w-full flex-col rounded-t-xl border border-slate-200 bg-white text-sm text-slate-800 shadow-xl sm:rounded-xl ${width}`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 id={titleId} className="text-base font-semibold text-slate-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-3">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}
