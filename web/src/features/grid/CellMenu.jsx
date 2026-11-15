import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Ban, Check, Coffee, Lock, LockOpen } from 'lucide-react';
import { useScheduleStore } from '../../store/useScheduleStore.js';
import { DAY_LONG, formatDM, shiftLabel } from './gridUtils.js';

const itemCls =
  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-800 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 disabled:opacity-50';

const MENU_W = 256;

/**
 * Menu de edição de uma célula: escolher turno, Folga, Ausente e travar/destravar.
 * Esc fecha; setas movem entre as opções; clicar fora fecha.
 * @param {{ employee: any, date: string, col: number, cell?: any, shifts: any[], anchor: {left:number,top:number,bottom:number}, onClose: (refocus: boolean) => void }} props
 */
export function CellMenu({ employee, date, col, cell, shifts, anchor, onClose }) {
  const ref = useRef(null);
  const setCell = useScheduleStore((s) => s.setCell);
  const togglePin = useScheduleStore((s) => s.togglePin);
  const title = `${employee.name}, ${DAY_LONG[col]} ${formatDM(date)}`;

  useEffect(() => {
    const items = [...ref.current.querySelectorAll('button:not([disabled])')];
    (items.find((b) => b.dataset.current === 'true') ?? items[0])?.focus();
    const onPointerDown = (e) => {
      if (!ref.current?.contains(e.target) && !e.target.closest?.('[data-pos]')) onClose(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
    // Só na abertura: o foco inicial não deve voltar a cada renderização.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (e) => {
    const items = [...ref.current.querySelectorAll('button:not([disabled])')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      onClose(true);
    } else if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault();
      items[(i + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1]?.focus();
    }
  };

  const choose = (value) => {
    setCell(employee.id, date, value);
    onClose(true);
  };

  const mobile = typeof window !== 'undefined' && window.innerWidth < 640;
  let position;
  if (!mobile) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.max(8, Math.min(anchor.left, vw - MENU_W - 8));
    position = anchor.bottom + 340 > vh ? { left, bottom: Math.max(8, vh - anchor.top + 4) } : { left, top: anchor.bottom + 4 };
  }

  const mark = (flag) => (flag ? <Check size={16} aria-hidden="true" className="ml-auto text-emerald-700" /> : null);
  const isOff = cell?.type === 'OFF';
  const isAbsence = cell?.type === 'ABSENCE';

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={`Editar célula de ${title}`}
      onKeyDown={onKeyDown}
      style={position ? { ...position, width: MENU_W } : undefined}
      className="fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-xl border border-slate-200 bg-white p-2 shadow-xl sm:inset-x-auto sm:bottom-auto sm:rounded-xl"
    >
      <p className="px-2 pb-1 pt-0.5 text-xs font-medium text-slate-600">{title}</p>
      {shifts.length === 0 && <p className="px-2 py-1 text-xs text-slate-600">Cadastre turnos na aba Turnos e Cobertura.</p>}
      {shifts.map((shift) => {
        const on = cell?.type === 'WORK' && cell.shiftId === shift.id;
        return (
          <button
            key={shift.id}
            type="button"
            role="menuitem"
            data-current={on ? 'true' : 'false'}
            className={itemCls}
            onClick={() => choose({ type: 'WORK', shiftId: shift.id })}
          >
            <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: shift.color }} />
            <span>
              <span className="font-semibold">{shiftLabel(shift)}</span> {shift.code ? shift.name : ''} {shift.startTime}–{shift.endTime}
            </span>
            {mark(on)}
          </button>
        );
      })}
      <div className="my-1 border-t border-slate-200" />
      <button type="button" role="menuitem" data-current={isOff ? 'true' : 'false'} className={itemCls} onClick={() => choose({ type: 'OFF' })}>
        <Coffee size={16} aria-hidden="true" className="text-slate-600" />
        Folga
        {mark(isOff)}
      </button>
      <button type="button" role="menuitem" data-current={isAbsence ? 'true' : 'false'} className={itemCls} onClick={() => choose({ type: 'ABSENCE' })}>
        <Ban size={16} aria-hidden="true" className="text-slate-600" />
        Ausente
        {mark(isAbsence)}
      </button>
      <div className="my-1 border-t border-slate-200" />
      <button
        type="button"
        role="menuitem"
        disabled={!cell}
        className={itemCls}
        onClick={() => {
          togglePin(employee.id, date);
          onClose(true);
        }}
      >
        {cell?.isPinned ? <LockOpen size={16} aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />}
        {cell?.isPinned ? 'Destravar célula' : 'Travar célula'}
      </button>
    </div>,
    document.body,
  );
}
