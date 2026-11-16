import { memo } from 'react';
import { Lock, OctagonAlert, TriangleAlert } from 'lucide-react';
import { DAY_LONG, describeIssues, formatDM, shiftLabel, shiftStyle } from './gridUtils.js';
import { describeCell } from './monthUtils.js';

/**
 * Célula compacta da matriz mensal (funcionário x dia). Só props primitivas além de `cell`/`shift`
 * (estáveis entre renders), então `memo` evita re-renderizar as células que não mudaram.
 * Dias fora do mês ficam esmaecidos e não abrem o menu de edição.
 * @param {{
 *   employeeId: string, employeeName: string, date: string, row: number, col: number,
 *   cell?: any, shift?: any, red: number, yellow: number, issueText: string,
 *   isActive: boolean, inMonth: boolean, onOpen: (row: number, col: number, el: HTMLElement) => void
 * }} props
 */
export const MonthCell = memo(function MonthCell({ employeeId, employeeName, date, row, col, cell, shift, red, yellow, issueText, isActive, inMonth, onOpen }) {
  const weekday = col % 7;
  const locked = Boolean(cell?.isPinned);
  const tipId = `mtip-${employeeId}-${date}`;

  let text;
  let tone = 'bg-white text-slate-500';
  let style;
  if (cell?.type === 'WORK' && shift) {
    text = shiftLabel(shift);
    tone = 'border-l-[3px] font-semibold';
    style = shiftStyle(shift.color);
  } else if (cell?.type === 'WORK') {
    text = '?';
    tone = 'bg-slate-100 text-slate-700 font-semibold';
  } else if (cell?.type === 'OFF') {
    text = 'F';
    tone = 'bg-slate-100 text-slate-700 font-semibold';
  } else if (cell?.type === 'ABSENCE') {
    text = 'A';
    tone = 'bg-sky-50 text-sky-900 font-semibold';
  } else {
    text = '·';
  }

  const summary = describeIssues(red, yellow);
  const label = [
    `${employeeName}, ${DAY_LONG[weekday]} ${formatDM(date)}: ${describeCell(cell, shift)}`,
    locked ? 'travada' : '',
    inMonth ? '' : 'fora do mês, não editável',
    summary,
  ]
    .filter(Boolean)
    .join(', ');
  const ring = red ? 'ring-2 ring-inset ring-rose-600' : yellow ? 'ring-2 ring-inset ring-amber-500' : '';
  const bg = !inMonth ? 'bg-slate-100' : weekday === 6 ? 'bg-slate-200' : '';

  return (
    <div
      role="gridcell"
      tabIndex={isActive ? 0 : -1}
      data-pos={`${row}-${col}`}
      data-date={date}
      data-employee={employeeId}
      aria-label={label}
      aria-describedby={issueText ? tipId : undefined}
      aria-haspopup={inMonth ? 'menu' : undefined}
      aria-disabled={inMonth ? undefined : true}
      title={issueText || undefined}
      onClick={(e) => inMonth && onOpen(row, col, e.currentTarget)}
      className={`relative flex select-none p-px focus:outline-none focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-slate-900 ${bg} ${
        weekday === 0 ? 'border-l-2 border-slate-400' : ''
      } ${inMonth ? 'cursor-pointer' : 'cursor-not-allowed'}`}
    >
      <div
        className={`relative flex min-w-0 flex-1 items-center justify-center rounded text-center text-[11px] leading-none ${tone} ${ring} ${inMonth ? 'hover:brightness-95' : 'opacity-40'}`}
        style={style}
      >
        <span className="max-w-full truncate px-0.5">{text}</span>
        {locked && <Lock size={9} aria-hidden="true" className="absolute right-px top-px opacity-80" />}
        {(red > 0 || yellow > 0) && (
          <span
            className={`absolute bottom-px right-px flex items-center rounded-sm bg-white/90 px-px ${red ? 'text-rose-700' : 'text-amber-800'}`}
            aria-hidden="true"
          >
            {red ? <OctagonAlert size={10} /> : <TriangleAlert size={10} />}
          </span>
        )}
      </div>
      {issueText && (
        <span id={tipId} className="sr-only">
          {issueText}
        </span>
      )}
    </div>
  );
});
