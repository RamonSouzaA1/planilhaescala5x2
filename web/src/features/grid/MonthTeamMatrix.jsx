import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { defaultRangeExtractor, observeElementRect, useVirtualizer } from '@tanstack/react-virtual';
import { OctagonAlert, TriangleAlert } from 'lucide-react';
import { useScheduleStore } from '../../store/useScheduleStore.js';
import { CellMenu } from './CellMenu.jsx';
import { MonthCell } from './MonthCell.jsx';
import { DAY_LONG, describeIssues, formatDM } from './gridUtils.js';
import { WEEKDAY_CAPS, splitSeverity, todayDateKey } from './monthUtils.js';

const ROW_H = 40;
const HEADER_H = 48;
const FOOTER_H = 52;
const DAY_W = '2.25rem';
const NO_ISSUES = [];
const STATUS_LABEL = { VACATION: 'Férias', MEDICAL_LEAVE: 'Atestado' };
/** jsdom e abas ocultas medem 0px: usa uma janela de tamanho razoável para sempre renderizar linhas. */
const FALLBACK_RECT = { width: 1000, height: 640 };
const observeRect = (instance, cb) => observeElementRect(instance, (rect) => cb(rect.height > 0 ? rect : FALLBACK_RECT));

const columns = (count) => `var(--name-w) repeat(${count}, ${DAY_W}) 4.5rem`;

/** Linha de um funcionário; só re-renderiza quando as entradas dela mudam, e as células são memo. */
const MonthRow = memo(function MonthRow({ employee, row, start, activeCol, dates, monthKey, cellIndex, shiftById, issuesByCell, alerts, onOpen }) {
  let offDays = 0;
  for (const date of dates) {
    if (date.startsWith(monthKey) && cellIndex.get(`${employee.id}|${date}`)?.type === 'OFF') offDays += 1;
  }
  const red = alerts?.red ?? 0;
  const yellow = alerts?.yellow ?? 0;
  const statusLabel = STATUS_LABEL[employee.status];

  return (
    <div
      role="row"
      aria-rowindex={row + 2}
      className="group absolute left-0 grid w-full border-b border-slate-100 bg-white hover:bg-slate-50"
      style={{ transform: `translateY(${start}px)`, height: ROW_H, gridTemplateColumns: columns(dates.length) }}
    >
      <div role="rowheader" className="sticky left-0 z-10 flex min-w-0 items-center gap-1 border-r border-slate-300 bg-white px-1.5 group-hover:bg-slate-50">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium leading-tight text-slate-900" title={employee.name}>
            {employee.name}
          </p>
          <p className="truncate text-[11px] leading-tight text-slate-600">
            {employee.roleTitle || 'Sem função'}
            {statusLabel && <span className="ml-1 rounded bg-sky-100 px-1 font-medium text-sky-900">{statusLabel}</span>}
          </p>
        </div>
        {(red > 0 || yellow > 0) && (
          <span
            role="img"
            aria-label={`${employee.name}: ${describeIssues(red, yellow)} no mês`}
            title={describeIssues(red, yellow)}
            className={`flex shrink-0 items-center gap-0.5 rounded-md px-1 py-0.5 text-xs font-bold ${red ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800'}`}
          >
            {red ? <OctagonAlert size={12} aria-hidden="true" /> : <TriangleAlert size={12} aria-hidden="true" />}
            {red + yellow}
          </span>
        )}
      </div>
      {dates.map((date, col) => {
        const cell = cellIndex.get(`${employee.id}|${date}`);
        const issue = splitSeverity(issuesByCell[`${employee.id}|${date}`] ?? NO_ISSUES);
        return (
          <MonthCell
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
            isActive={activeCol === col}
            inMonth={date.startsWith(monthKey)}
            onOpen={onOpen}
          />
        );
      })}
      <div
        role="gridcell"
        aria-label={`Resumo de ${employee.name}: ${offDays} folga${offDays === 1 ? '' : 's'} no mês`}
        className="flex flex-col items-center justify-center border-l-2 border-slate-400 text-center"
      >
        <span className="text-sm font-medium tabular-nums text-slate-900">{offDays}</span>
        <span className="text-[11px] text-slate-600">folga{offDays === 1 ? '' : 's'}</span>
      </div>
    </div>
  );
});

/**
 * Matriz funcionários x dias do mês (colunas = semanas inteiras que tocam o mês), virtualizada.
 * Teclado: setas movem a célula ativa, Home/End início/fim da linha, PageUp/PageDown 10 linhas,
 * Enter/Espaço/F2 abre o menu, P trava/destrava. Dias fora do mês são navegáveis, mas não editáveis.
 * @param {{ data: ReturnType<import('./useMonthData.js').useMonthData>, rows: any[], focusTarget?: { employeeId: string, date: string | null, nonce: number } | null }} props
 */
export function MonthTeamMatrix({ data, rows, focusTarget }) {
  const { employees, shifts, dates, monthKey, cellIndex, shiftById, issues, cells } = data;
  const cols = dates.length;

  const scrollRef = useRef(null);
  const [active, setActive] = useState({ row: 0, col: 0 });
  const [menu, setMenu] = useState(null);
  const pendingFocus = useRef(false);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const activeRow = Math.min(active.row, Math.max(0, rows.length - 1));
  const activeRowRef = useRef(activeRow);
  activeRowRef.current = activeRow;

  const rangeExtractor = useCallback((range) => {
    const base = defaultRangeExtractor(range);
    const keep = activeRowRef.current;
    return keep < range.count && !base.includes(keep) ? [...base, keep] : base;
  }, []);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 6,
    scrollMargin: HEADER_H,
    scrollPaddingStart: HEADER_H,
    scrollPaddingEnd: FOOTER_H,
    initialRect: FALLBACK_RECT,
    observeElementRect: observeRect,
    rangeExtractor,
  });

  const focusCell = useCallback(
    (row, col) => {
      pendingFocus.current = true;
      setActive({ row, col });
      virtualizer.scrollToIndex(row);
    },
    [virtualizer],
  );

  useEffect(() => {
    if (!pendingFocus.current) return;
    const el = scrollRef.current?.querySelector(`[data-pos="${activeRow}-${active.col}"]`);
    if (el) {
      pendingFocus.current = false;
      el.focus();
    }
  });

  // Ao trocar de mês, o primeiro dia do mês fica logo depois da coluna do nome.
  useEffect(() => {
    const scroller = scrollRef.current;
    const first = scroller?.querySelector('[role="columnheader"][data-inmonth="true"]');
    const nameColumn = scroller?.querySelector('[role="columnheader"]');
    if (first && nameColumn) scroller.scrollLeft = Math.max(0, first.offsetLeft - nameColumn.offsetWidth);
  }, [monthKey]);

  useEffect(() => {
    if (!focusTarget) return;
    const row = rowsRef.current.findIndex((e) => e.id === focusTarget.employeeId);
    if (row < 0) return;
    const col = focusTarget.date ? Math.max(0, dates.indexOf(focusTarget.date)) : 0;
    focusCell(row, col);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTarget?.nonce]);

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
      if (m && refocus) focusCell(m.row, m.col);
    },
    [focusCell],
  );

  const onKeyDown = (e) => {
    const el = e.target.closest?.('[data-pos]');
    if (!el) return;
    const [row, col] = el.dataset.pos.split('-').map(Number);
    const last = rows.length - 1;
    const inMonth = dates[col].startsWith(monthKey);
    let next = null;
    switch (e.key) {
      case 'ArrowRight': next = [row, Math.min(cols - 1, col + 1)]; break;
      case 'ArrowLeft': next = [row, Math.max(0, col - 1)]; break;
      case 'ArrowDown': next = [Math.min(last, row + 1), col]; break;
      case 'ArrowUp': next = [Math.max(0, row - 1), col]; break;
      case 'PageDown': next = [Math.min(last, row + 10), col]; break;
      case 'PageUp': next = [Math.max(0, row - 10), col]; break;
      case 'Home': next = e.ctrlKey ? [0, 0] : [row, 0]; break;
      case 'End': next = e.ctrlKey ? [last, cols - 1] : [row, cols - 1]; break;
      case 'Enter':
      case ' ':
      case 'F2':
        e.preventDefault();
        if (inMonth) openMenu(row, col, el);
        return;
      case 'p':
      case 'P':
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault();
        if (inMonth) useScheduleStore.getState().togglePin(rows[row].id, dates[col]);
        return;
      default:
        return;
    }
    e.preventDefault();
    focusCell(next[0], next[1]);
  };

  const totals = useMemo(() => {
    const ids = new Set(employees.map((e) => e.id));
    const byDate = new Map(dates.map((d) => [d, { work: 0, off: 0 }]));
    for (const a of cells) {
      if (!ids.has(a.employeeId)) continue;
      const t = byDate.get(a.date);
      if (!t) continue;
      if (a.type === 'WORK') t.work += 1;
      else if (a.type === 'OFF') t.off += 1;
    }
    return dates.map((d) => byDate.get(d));
  }, [employees, dates, cells]);

  const todayKey = useMemo(() => todayDateKey(), []);
  const menuEmployee = menu ? rows[menu.row] : null;
  const totalWidth = `calc(var(--name-w) + ${cols} * ${DAY_W} + 4.5rem)`;

  return (
    <div
      ref={scrollRef}
      onKeyDown={onKeyDown}
      className="relative h-[min(72vh,52rem)] min-h-[20rem] scroll-pl-[8rem] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm [--name-w:7rem] sm:scroll-pl-[11rem] sm:[--name-w:10.5rem]"
    >
      <div role="grid" aria-label="Escala mensal" aria-rowcount={rows.length + 2} aria-colcount={cols + 2} style={{ width: totalWidth }}>
        <div role="row" aria-rowindex={1} className="sticky top-0 z-30 grid border-b border-slate-300 bg-slate-100" style={{ gridTemplateColumns: columns(cols), height: HEADER_H }}>
          <div role="columnheader" className="sticky left-0 z-10 flex items-center border-r border-slate-300 bg-slate-100 px-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
            Funcionário
          </div>
          {dates.map((date, i) => {
            const weekday = i % 7;
            const inMonth = date.startsWith(monthKey);
            return (
              <div
                key={date}
                role="columnheader"
                data-inmonth={inMonth}
                aria-label={`${DAY_LONG[weekday]} ${formatDM(date)}${inMonth ? '' : ', fora do mês'}`}
                className={`flex flex-col items-center justify-center text-[11px] leading-tight ${weekday === 0 ? 'border-l-2 border-slate-400' : ''} ${
                  date === todayKey ? 'bg-emerald-200 text-emerald-950' : weekday === 6 ? 'bg-slate-300 text-slate-900' : 'text-slate-700'
                } ${inMonth ? '' : 'opacity-50'}`}
              >
                <span className={`tracking-wide ${weekday === 6 ? 'font-bold' : 'font-semibold'}`}>{WEEKDAY_CAPS[weekday]}</span>
                <span className="text-sm font-semibold tabular-nums">{date.slice(8, 10)}</span>
              </div>
            );
          })}
          <div role="columnheader" className="flex items-center justify-center border-l-2 border-slate-400 text-xs font-semibold uppercase tracking-wide text-slate-700">
            Folgas
          </div>
        </div>

        <div role="rowgroup" className="relative" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const employee = rows[item.index];
            if (!employee) return null;
            return (
              <MonthRow
                key={employee.id}
                employee={employee}
                row={item.index}
                start={item.start - HEADER_H}
                activeCol={item.index === activeRow ? active.col : -1}
                dates={dates}
                monthKey={monthKey}
                cellIndex={cellIndex}
                shiftById={shiftById}
                issuesByCell={issues.issuesByCell}
                alerts={issues.counts.get(employee.id)}
                onOpen={openMenu}
              />
            );
          })}
          {rows.length === 0 && <p className="p-6 text-center text-sm text-slate-600">Nenhum funcionário corresponde aos filtros.</p>}
        </div>

        <div role="row" aria-rowindex={rows.length + 2} className="sticky bottom-0 z-20 grid border-t border-slate-300 bg-slate-50" style={{ gridTemplateColumns: columns(cols), minHeight: FOOTER_H }}>
          <div role="rowheader" className="sticky left-0 z-10 flex flex-col justify-center border-r border-slate-300 bg-slate-50 px-2 text-[11px] leading-tight text-slate-700">
            <span className="font-semibold">Trabalhando</span>
            <span>Folga</span>
          </div>
          {dates.map((date, i) => {
            const weekday = i % 7;
            const inMonth = date.startsWith(monthKey);
            const dayIssues = issues.issuesByDate[date] ?? NO_ISSUES;
            const text = dayIssues.map((x) => x.message).join('\n');
            return (
              <div
                key={date}
                role="gridcell"
                title={text || undefined}
                aria-label={`${DAY_LONG[weekday]} ${formatDM(date)}: Trabalhando ${totals[i].work}, Folga ${totals[i].off}${
                  dayIssues.length ? `, ${dayIssues.length} alerta${dayIssues.length > 1 ? 's' : ''} de cobertura: ${text.replace(/\n/g, '; ')}` : ''
                }`}
                className={`flex flex-col items-center justify-center text-[11px] leading-tight tabular-nums ${weekday === 0 ? 'border-l-2 border-slate-400' : ''} ${
                  weekday === 6 ? 'bg-slate-200' : ''
                } ${inMonth ? '' : 'opacity-50'}`}
              >
                <span className="text-xs font-bold text-slate-900">{totals[i].work}</span>
                <span className="text-slate-700">{totals[i].off}</span>
                {dayIssues.length > 0 && <TriangleAlert size={10} aria-hidden="true" className="text-amber-700" />}
              </div>
            );
          })}
          <div role="gridcell" aria-hidden="true" className="border-l-2 border-slate-400" />
        </div>
      </div>

      {menu && menuEmployee && (
        <CellMenu
          key={`${menu.row}-${menu.col}`}
          employee={menuEmployee}
          date={dates[menu.col]}
          col={menu.col % 7}
          cell={cellIndex.get(`${menuEmployee.id}|${dates[menu.col]}`)}
          shifts={shifts}
          anchor={menu.anchor}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}
