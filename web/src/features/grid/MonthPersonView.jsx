import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Lock, OctagonAlert, TriangleAlert } from 'lucide-react';
import { useScheduleStore } from '../../store/useScheduleStore.js';
import { CellMenu } from './CellMenu.jsx';
import { DAY_LONG, describeIssues, formatDM, shiftLabel, shiftStyle } from './gridUtils.js';
import { WEEKDAY_CAPS, describeCell, splitSeverity, todayDateKey } from './monthUtils.js';
import { fieldCls, iconBtn } from './GridToolbar.jsx';

const NO_ISSUES = [];

/** Dia do calendário da pessoa. Só props primitivas além de `cell`/`shift`, então `memo` poupa re-renderizações. */
const DayCard = memo(function DayCard({ employeeId, employeeName, date, row, col, cell, shift, red, yellow, issueText, isActive, inMonth, isToday, onOpen }) {
  const locked = Boolean(cell?.isPinned);
  const tipId = `ptip-${employeeId}-${date}`;
  let main = '–';
  let sub = '';
  let subShort = '';
  let tone = 'bg-white text-slate-500';
  let style;
  if (cell?.type === 'WORK' && shift) {
    main = shiftLabel(shift);
    sub = `${shift.startTime}–${shift.endTime}`;
    subShort = shift.startTime;
    tone = 'border-l-4 font-semibold';
    style = shiftStyle(shift.color);
  } else if (cell?.type === 'WORK') {
    main = 'Sem turno';
    tone = 'bg-slate-100 text-slate-700';
  } else if (cell?.type === 'OFF') {
    main = 'Folga';
    tone = 'bg-slate-100 text-slate-700 font-medium';
  } else if (cell?.type === 'ABSENCE') {
    main = 'Ausente';
    tone = 'bg-sky-50 text-sky-900 font-medium';
  }
  const label = [
    `${employeeName}, ${DAY_LONG[col]} ${formatDM(date)}: ${describeCell(cell, shift)}`,
    locked ? 'travada' : '',
    inMonth ? '' : 'fora do mês, não editável',
    describeIssues(red, yellow),
  ]
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
      aria-haspopup={inMonth ? 'menu' : undefined}
      aria-disabled={inMonth ? undefined : true}
      title={issueText || undefined}
      onClick={(e) => inMonth && onOpen(row, col, e.currentTarget)}
      className={`relative flex min-h-[4.25rem] min-w-0 select-none flex-col justify-between rounded-md border border-slate-200 p-1 text-left focus:outline-none focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-slate-900 sm:min-h-[5.5rem] sm:p-1.5 ${tone} ${ring} ${
        inMonth ? 'cursor-pointer hover:brightness-95' : 'cursor-not-allowed opacity-40'
      }`}
      style={style}
    >
      <span className={`flex items-center justify-between text-[11px] font-semibold tabular-nums ${isToday ? 'text-emerald-800' : 'opacity-80'}`}>
        <span className={isToday ? 'rounded bg-emerald-600 px-1 text-white' : ''}>{date.slice(8, 10)}</span>
        {locked && <Lock size={11} aria-hidden="true" />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold leading-tight sm:text-sm">{main}</span>
        {sub && (
          <span className="block truncate text-[10px] leading-tight opacity-90 sm:text-xs">
            <span className="sm:hidden">{subShort}</span>
            <span className="max-sm:hidden">{sub}</span>
          </span>
        )}
      </span>
      {(red > 0 || yellow > 0) && (
        <span aria-hidden="true" className={`absolute bottom-0.5 right-0.5 flex items-center gap-0.5 rounded bg-white/90 px-0.5 text-[11px] font-bold leading-none ${red ? 'text-rose-700' : 'text-amber-800'}`}>
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

/**
 * Visão "Por pessoa": escolhe o funcionário e mostra o calendário do mês em 7 colunas (SEG..DOM).
 * Teclado: setas movem o dia ativo, Home/End início/fim da semana, Enter/Espaço/F2 abre o menu, P trava.
 * @param {{ data: ReturnType<import('./useMonthData.js').useMonthData>, rows: any[], personId: string | null, onPersonChange: (id: string) => void, focusTarget?: { employeeId: string, date: string | null, nonce: number } | null }} props
 */
export function MonthPersonView({ data, rows, personId, onPersonChange, focusTarget }) {
  const { shifts, dates, monthKey, cellIndex, shiftById, issues, weeks } = data;
  const index = Math.max(0, rows.findIndex((e) => e.id === personId));
  const employee = rows[index];

  const gridRef = useRef(null);
  const [active, setActive] = useState({ row: 0, col: 0 });
  const [menu, setMenu] = useState(null);
  const pendingFocus = useRef(false);
  const handledNonce = useRef(0);
  const todayKey = useMemo(() => todayDateKey(), []);
  const lastRow = weeks.length - 1;

  // Primeiro dia do mês como dia ativo ao trocar de pessoa ou de mês.
  useEffect(() => {
    const first = dates.findIndex((d) => d.startsWith(monthKey));
    setActive({ row: Math.floor(first / 7), col: first % 7 });
  }, [employee?.id, monthKey, dates]);

  const focusDay = useCallback((row, col) => {
    pendingFocus.current = true;
    setActive({ row, col });
  }, []);

  useEffect(() => {
    if (!pendingFocus.current) return;
    const el = gridRef.current?.querySelector(`[data-pos="${active.row}-${active.col}"]`);
    if (el) {
      pendingFocus.current = false;
      el.focus();
    }
  });

  useEffect(() => {
    if (!focusTarget || focusTarget.employeeId !== employee?.id || handledNonce.current === focusTarget.nonce) return;
    handledNonce.current = focusTarget.nonce;
    const i = Math.max(0, focusTarget.date ? dates.indexOf(focusTarget.date) : dates.findIndex((d) => d.startsWith(monthKey)));
    focusDay(Math.floor(i / 7), i % 7);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTarget?.nonce, employee?.id]);

  const openMenu = useCallback((row, col, el) => {
    const rect = el.getBoundingClientRect();
    setActive({ row, col });
    setMenu({ row, col, anchor: { left: rect.left, top: rect.top, bottom: rect.bottom } });
  }, []);
  const menuRef = useRef(null);
  menuRef.current = menu;
  const closeMenu = useCallback(
    (refocus) => {
      const m = menuRef.current;
      setMenu(null);
      if (m && refocus) focusDay(m.row, m.col);
    },
    [focusDay],
  );

  if (!employee) {
    return <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm">Nenhum funcionário corresponde aos filtros.</div>;
  }

  const onKeyDown = (e) => {
    const el = e.target.closest?.('[data-pos]');
    if (!el) return;
    const [row, col] = el.dataset.pos.split('-').map(Number);
    const at = (r, c) => dates[r * 7 + c];
    let next = null;
    switch (e.key) {
      case 'ArrowRight': next = [row, Math.min(6, col + 1)]; break;
      case 'ArrowLeft': next = [row, Math.max(0, col - 1)]; break;
      case 'ArrowDown': next = [Math.min(lastRow, row + 1), col]; break;
      case 'ArrowUp': next = [Math.max(0, row - 1), col]; break;
      case 'Home': next = e.ctrlKey ? [0, 0] : [row, 0]; break;
      case 'End': next = e.ctrlKey ? [lastRow, 6] : [row, 6]; break;
      case 'Enter':
      case ' ':
      case 'F2':
        e.preventDefault();
        if (at(row, col).startsWith(monthKey)) openMenu(row, col, el);
        return;
      case 'p':
      case 'P':
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault();
        if (at(row, col).startsWith(monthKey)) useScheduleStore.getState().togglePin(employee.id, at(row, col));
        return;
      default:
        return;
    }
    e.preventDefault();
    focusDay(next[0], next[1]);
  };

  const alerts = issues.counts.get(employee.id);
  const personIssues = issues.weekGroups.flatMap((g) => g.issues.filter((i) => i.employeeId === employee.id));
  let offDays = 0;
  let workDays = 0;
  for (const date of dates) {
    if (!date.startsWith(monthKey)) continue;
    const type = cellIndex.get(`${employee.id}|${date}`)?.type;
    if (type === 'OFF') offDays += 1;
    else if (type === 'WORK') workDays += 1;
  }
  const step = (delta) => {
    const next = rows[(index + delta + rows.length) % rows.length];
    if (next) onPersonChange(next.id);
  };
  const menuDate = menu ? dates[menu.row * 7 + menu.col] : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
        <button type="button" className={iconBtn} onClick={() => step(-1)} aria-label="Pessoa anterior" disabled={rows.length < 2}>
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <select aria-label="Pessoa" value={employee.id} onChange={(e) => onPersonChange(e.target.value)} className={`${fieldCls} min-w-0 flex-1 sm:max-w-xs sm:flex-none`}>
          {rows.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <button type="button" className={iconBtn} onClick={() => step(1)} aria-label="Próxima pessoa" disabled={rows.length < 2}>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
        <p className="w-full text-xs text-slate-700 sm:ml-2 sm:w-auto" data-testid="person-summary">
          <span className="font-semibold">{employee.roleTitle || 'Sem função'}</span> · {workDays} dia{workDays === 1 ? '' : 's'} de trabalho · {offDays} folga{offDays === 1 ? '' : 's'} no mês
          {alerts ? ` · ${describeIssues(alerts.red, alerts.yellow)}` : ' · sem alertas'}
        </p>
      </div>

      <div ref={gridRef} onKeyDown={onKeyDown} role="grid" aria-label={`Calendário de ${employee.name}`} className="rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm sm:p-2.5">
        <div role="row" className="mb-1 grid grid-cols-7 gap-1 sm:gap-1.5">
          {WEEKDAY_CAPS.map((cap, i) => (
            <div key={cap} role="columnheader" aria-label={DAY_LONG[i]} className={`rounded text-center text-[11px] font-bold tracking-wide ${i === 6 ? 'bg-slate-200 text-slate-900' : 'text-slate-700'}`}>
              {cap}
            </div>
          ))}
        </div>
        {weeks.map((weekStart, row) => (
          <div key={weekStart} role="row" className="mb-1 grid grid-cols-7 gap-1 sm:mb-1.5 sm:gap-1.5">
            {Array.from({ length: 7 }, (_, col) => {
              const date = dates[row * 7 + col];
              const cell = cellIndex.get(`${employee.id}|${date}`);
              const issue = splitSeverity(issues.issuesByCell[`${employee.id}|${date}`] ?? NO_ISSUES);
              return (
                <DayCard
                  key={date}
                  employeeId={employee.id}
                  employeeName={employee.name}
                  date={date}
                  row={row}
                  col={col}
                  cell={cell}
                  shift={cell?.type === 'WORK' ? shiftById.get(cell.shiftId) : undefined}
                  red={issue.red}
                  yellow={issue.yellow}
                  issueText={issue.text}
                  isActive={active.row === row && active.col === col}
                  inMonth={date.startsWith(monthKey)}
                  isToday={date === todayKey}
                  onOpen={openMenu}
                />
              );
            })}
          </div>
        ))}
      </div>

      {personIssues.length > 0 && (
        <section aria-label={`Alertas de ${employee.name}`} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-700">Alertas de {employee.name}</h3>
          <ul className="flex flex-col gap-1">
            {personIssues.map((issue, i) => {
              const red = issue.severity === 'RED';
              return (
                <li key={`${issue.code}-${issue.date}-${i}`}>
                  <button
                    type="button"
                    onClick={() => {
                      const at = Math.max(0, issue.date ? dates.indexOf(issue.date) : dates.findIndex((d) => d.startsWith(monthKey)));
                      focusDay(Math.floor(at / 7), at % 7);
                    }}
                    className="flex w-full items-start gap-1.5 rounded-md px-1.5 py-1 text-left text-xs text-slate-800 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-600"
                  >
                    {red ? <OctagonAlert size={14} aria-hidden="true" className="mt-px shrink-0 text-rose-700" /> : <TriangleAlert size={14} aria-hidden="true" className="mt-px shrink-0 text-amber-700" />}
                    <span>
                      <span className="sr-only">{red ? 'Vermelho: ' : 'Amarelo: '}</span>
                      {issue.date && <span className="mr-1 font-semibold tabular-nums">{formatDM(issue.date)}</span>}
                      {issue.message}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {menu && menuDate && (
        <CellMenu
          key={`${menu.row}-${menu.col}`}
          employee={employee}
          date={menuDate}
          col={menu.col}
          cell={cellIndex.get(`${employee.id}|${menuDate}`)}
          shifts={shifts}
          anchor={menu.anchor}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}
