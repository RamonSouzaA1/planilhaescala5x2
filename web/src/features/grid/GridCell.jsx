import { memo } from 'react';
import { Lock, OctagonAlert, TriangleAlert } from 'lucide-react';
import { DAY_LONG, describeIssues, formatDM, shiftLabel, shiftStyle } from './gridUtils.js';

/**
 * Célula da grade (funcionário x dia). Recebe só valores primitivos além de `cell`/`shift`,
 * que são estáveis entre renders: assim `memo` evita re-renderizar as células que não mudaram.
 * @param {{
 *   employeeId: string, employeeName: string, date: string, row: number, col: number,
 *   cell?: any, shift?: any, red: number, yellow: number, issueText: string,
 *   isActive: boolean, onOpen: (row: number, col: number, el: HTMLElement) => void
 * }} props
 */
export const GridCell = memo(function GridCell({
  employeeId,
  employeeName,
  date,
  row,
  col,
  cell,
  shift,
  red,
  yellow,
  issueText,
  isActive,
  onOpen,
}) {
  const locked = Boolean(cell?.isPinned);
  const tipId = `tip-${employeeId}-${date}`;

  let content;
  let description;
  let tone;
  let style;
  if (cell?.type === 'WORK' && shift) {
    description = `${shiftLabel(shift)}${shift.code ? ` ${shift.name}` : ''} ${shift.startTime}–${shift.endTime}`;
    tone = 'border-l-4 font-semibold';
    style = shiftStyle(shift.color);
    content = (
      <>
        <span className="text-sm leading-tight">{shiftLabel(shift)}</span>
        <span className="text-xs font-normal leading-tight opacity-90">{shift.startTime}</span>
      </>
    );
  } else if (cell?.type === 'WORK') {
    description = 'Turno removido';
    tone = 'bg-slate-100 text-slate-700';
    content = <span className="text-xs">Sem turno</span>;
  } else if (cell?.type === 'OFF') {
    description = 'Folga';
    tone = 'bg-slate-100 text-slate-700 font-medium';
    content = <span className="text-sm">Folga</span>;
  } else if (cell?.type === 'ABSENCE') {
    description = 'Ausente';
    tone = 'bg-sky-50 text-sky-900 font-medium';
    content = <span className="text-sm">Ausente</span>;
  } else {
    description = 'sem escala';
    tone = 'bg-white text-slate-500';
    content = <span aria-hidden="true">–</span>;
  }

  const summary = describeIssues(red, yellow);
  const label = [`${employeeName}, ${DAY_LONG[col]} ${formatDM(date)}: ${description}`, locked ? 'travada' : '', summary]
    .filter(Boolean)
    .join(', ');
  const ring = red ? 'ring-2 ring-inset ring-rose-600' : yellow ? 'ring-2 ring-inset ring-amber-500' : '';

  return (
    <div
      role="gridcell"
      tabIndex={isActive ? 0 : -1}
      data-pos={`${row}-${col}`}
      data-date={date}
      data-employee={employeeId}
      aria-label={label}
      aria-describedby={issueText ? tipId : undefined}
      aria-haspopup="menu"
      title={issueText || undefined}
      onClick={(e) => onOpen(row, col, e.currentTarget)}
      className={`relative m-0.5 flex cursor-pointer select-none flex-col items-center justify-center rounded-md text-center transition-colors hover:brightness-95 focus:outline-none focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-slate-900 ${tone} ${ring}`}
      style={style}
    >
      {content}
      {locked && <Lock size={12} aria-hidden="true" className="absolute right-0.5 top-0.5 opacity-80" />}
      {(red > 0 || yellow > 0) && (
        <span
          className={`absolute bottom-0.5 right-0.5 flex items-center gap-0.5 rounded bg-white/90 px-0.5 text-[11px] font-bold leading-none ${red ? 'text-rose-700' : 'text-amber-800'}`}
          aria-hidden="true"
        >
          {red ? <OctagonAlert size={12} /> : <TriangleAlert size={12} />}
          {red + yellow}
        </span>
      )}
      {issueText && (
        <span id={tipId} className="sr-only">
          {issueText}
        </span>
      )}
    </div>
  );
});
