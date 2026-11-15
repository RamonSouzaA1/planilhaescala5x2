import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { defaultRangeExtractor, observeElementRect, useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, ChevronRight, OctagonAlert, TriangleAlert, Users } from 'lucide-react';
import { addDays } from '@escala/shared/utils/dateUtils.js';
import { getShiftLegalMinutes, SEVERITY } from '@escala/shared/utils/cltValidator.js';
import { useScheduleStore } from '../../store/useScheduleStore.js';
import {
  selectActiveDepartment,
  selectDepartmentEmployees,
  selectDepartmentShifts,
  selectWeekAssignments,
  selectWeekValidation,
} from '../../store/selectors.js';
import { CellMenu } from './CellMenu.jsx';
import { CoverageHeatmap } from './CoverageHeatmap.jsx';
import { GridCell } from './GridCell.jsx';
import { DAY_SHORT, DAY_LONG, OFF_FILTER, describeIssues, formatDM, formatHours, getWeekDates, normalizeText } from './gridUtils.js';

const ROW_H = 48;
const HEADER_H = 52;
const FOOTER_H = 64;
const COLS = '11rem repeat(7, minmax(5.5rem, 1fr)) 6.5rem';
const MIN_WIDTH = '60rem';
/** jsdom e abas ocultas medem 0px: usa uma janela de tamanho razoável para sempre renderizar linhas. */
const FALLBACK_RECT = { width: 1000, height: 640 };
const NO_ISSUES = [];
const STATUS_LABEL = { VACATION: 'Férias', MEDICAL_LEAVE: 'Atestado' };

const observeRect = (instance, cb) => observeElementRect(instance, (rect) => cb(rect.height > 0 ? rect : FALLBACK_RECT));

/** Linha de um funcionário. Só re-renderiza quando as entradas dela mudam; as células são memo. */
const GridRow = memo(function GridRow({ employee, row, start, activeCol, dates, cellIndex, shiftById, issuesByCell, employeeIssues, targetMinutes, onOpen }) {
  let legalMinutes = 0;
  let offDays = 0;
  for (const date of dates) {
    const cell = cellIndex.get(`${employee.id}|${date}`);
    if (cell?.type === 'OFF') offDays += 1;
    else if (cell?.type === 'WORK' && shiftById.has(cell.shiftId)) legalMinutes += getShiftLegalMinutes(shiftById.get(cell.shiftId));
  }
  const overTarget = targetMinutes > 0 && legalMinutes > targetMinutes;
  const red = employeeIssues.filter((i) => i.severity === SEVERITY.RED).length;
  const yellow = employeeIssues.length - red;
  const statusLabel = STATUS_LABEL[employee.status];

  return (
    <div
      role="row"
      aria-rowindex={row + 2}
      className="group absolute left-0 grid w-full border-b border-slate-100 bg-white hover:bg-slate-50"
      style={{ transform: `translateY(${start}px)`, height: ROW_H, gridTemplateColumns: COLS }}
    >
      <div role="rowheader" className="sticky left-0 z-10 flex min-w-0 items-center gap-1.5 border-r border-slate-200 bg-white px-2 group-hover:bg-slate-50">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight text-slate-900" title={employee.name}>
            {employee.name}
          </p>
          <p className="truncate text-xs leading-tight text-slate-600">
            {employee.roleTitle || 'Sem função'}
            {statusLabel && <span className="ml-1 rounded bg-sky-100 px-1 font-medium text-sky-900">{statusLabel}</span>}
          </p>
        </div>
        {(red > 0 || yellow > 0) && (
          <span
            role="img"
            aria-label={describeIssues(red, yellow)}
            title={describeIssues(red, yellow)}
            className={`flex shrink-0 items-center gap-0.5 rounded-md px-1 py-0.5 text-xs font-bold ${red ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800'}`}
          >
            {red ? <OctagonAlert size={14} aria-hidden="true" /> : <TriangleAlert size={14} aria-hidden="true" />}
            {red + yellow}
          </span>
        )}
      </div>
      {dates.map((date, col) => {
        const cell = cellIndex.get(`${employee.id}|${date}`);
        const issues = issuesByCell[`${employee.id}|${date}`] ?? NO_ISSUES;
        const redCount = issues.filter((i) => i.severity === SEVERITY.RED).length;
        return (
          <GridCell
            key={date}
            employeeId={employee.id}
            employeeName={employee.name}
            date={date}
            row={row}
            col={col}
            cell={cell}
            shift={cell?.type === 'WORK' ? shiftById.get(cell.shiftId) : undefined}
            red={redCount}
            yellow={issues.length - redCount}
            issueText={issues.map((i) => i.message).join('\n')}
            isActive={activeCol === col}
            onOpen={onOpen}
          />
        );
      })}
      <div
        role="gridcell"
        aria-label={`Resumo de ${employee.name}: ${formatHours(legalMinutes)} legais na semana${overTarget ? ', acima da meta' : ''}, ${offDays} folga${offDays === 1 ? '' : 's'}`}
        className="flex flex-col items-center justify-center border-l border-slate-200 text-center"
      >
        <span className={`flex items-center gap-1 text-sm tabular-nums ${overTarget ? 'font-bold text-rose-700' : 'font-medium text-slate-900'}`}>
          {overTarget && <OctagonAlert size={14} aria-hidden="true" />}
          {formatHours(legalMinutes)}
        </span>
        <span className="text-xs text-slate-600">
          {offDays} folga{offDays === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
});

/**
 * Grade interativa funcionários x 7 dias, virtualizada.
 * Teclado: setas movem a célula ativa, Home/End início/fim da linha, PageUp/PageDown 10 linhas,
 * Enter/Espaço/F2 abre o menu, P trava/destrava, Esc fecha o menu.
 * @param {{ filters: { query: string, shiftId: string, tag: string, onlyAlerts: boolean }, focusTarget?: { employeeId: string, date: string | null, nonce: number } | null, heatOpen: boolean, onHeatOpenChange: (open: boolean) => void }} props
 */
export function ScheduleGrid({ filters, focusTarget, heatOpen, onHeatOpenChange }) {
  const department = useScheduleStore(selectActiveDepartment);
  const allEmployees = useScheduleStore(selectDepartmentEmployees);
  const shifts = useScheduleStore(selectDepartmentShifts);
  const weekCells = useScheduleStore(selectWeekAssignments);
  const validation = useScheduleStore(selectWeekValidation);
  const weekStart = useScheduleStore((s) => s.currentWeekStart);
  const allAssignments = useScheduleStore((s) => s.assignments);

  const dates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const employees = useMemo(() => allEmployees.filter((e) => e.status !== 'INACTIVE'), [allEmployees]);
  const shiftById = useMemo(() => new Map(shifts.map((s) => [s.id, s])), [shifts]);
  const cellIndex = useMemo(() => new Map(weekCells.map((a) => [`${a.employeeId}|${a.date}`, a])), [weekCells]);
  const issuesByCell = validation?.issuesByCell ?? {};
  const issuesByEmployee = validation?.issuesByEmployee ?? {};
  const targetMinutes = (Number(department?.weeklyHoursTarget) || 0) * 60;

  const query = normalizeText(useDeferredValue(filters.query).trim());
  const rows = useMemo(
    () =>
      employees.filter((e) => {
        if (query && !normalizeText(e.name).includes(query)) return false;
        if (filters.tag && !e.tags?.includes(filters.tag)) return false;
        if (filters.onlyAlerts && !issuesByEmployee[e.id]?.length) return false;
        if (filters.shiftId) {
          const match = dates.some((date) => {
            const cell = cellIndex.get(`${e.id}|${date}`);
            return filters.shiftId === OFF_FILTER ? cell?.type === 'OFF' : cell?.type === 'WORK' && cell.shiftId === filters.shiftId;
          });
          if (!match) return false;
        }
        return true;
      }),
    [employees, query, filters.tag, filters.shiftId, filters.onlyAlerts, issuesByEmployee, dates, cellIndex],
  );

  // ----- célula ativa (roving tabindex) e menu
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
    overscan: 8,
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

  // Depois de renderizar, devolve o foco à célula pedida (que pode ter acabado de ser virtualizada).
  useEffect(() => {
    if (!pendingFocus.current) return;
    const el = scrollRef.current?.querySelector(`[data-pos="${activeRow}-${active.col}"]`);
    if (el) {
      pendingFocus.current = false;
      el.focus();
    }
  });

  // Pedido externo (clique num alerta do painel): rola até a célula e foca.
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
  /** Fecha o menu; com `refocus` (Esc ou escolha) devolve o foco à célula, senão deixa o foco onde o usuário clicou. */
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
    let next = null;
    switch (e.key) {
      case 'ArrowRight': next = [row, Math.min(6, col + 1)]; break;
      case 'ArrowLeft': next = [row, Math.max(0, col - 1)]; break;
      case 'ArrowDown': next = [Math.min(last, row + 1), col]; break;
      case 'ArrowUp': next = [Math.max(0, row - 1), col]; break;
      case 'PageDown': next = [Math.min(last, row + 10), col]; break;
      case 'PageUp': next = [Math.max(0, row - 10), col]; break;
      case 'Home': next = e.ctrlKey ? [0, 0] : [row, 0]; break;
      case 'End': next = e.ctrlKey ? [last, 6] : [row, 6]; break;
      case 'Enter':
      case ' ':
      case 'F2':
        e.preventDefault();
        openMenu(row, col, el);
        return;
      case 'p':
      case 'P':
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault();
        useScheduleStore.getState().togglePin(rows[row].id, dates[col]);
        return;
      default:
        return;
    }
    e.preventDefault();
    focusCell(next[0], next[1]);
  };

  // ----- totais por dia e dados do heatmap
  const totals = useMemo(() => {
    const ids = new Set(employees.map((e) => e.id));
    return dates.map((date) => {
      let work = 0;
      let off = 0;
      for (const a of weekCells) {
        if (a.date !== date || !ids.has(a.employeeId)) continue;
        if (a.type === 'WORK') work += 1;
        else if (a.type === 'OFF') off += 1;
      }
      return { work, off };
    });
  }, [employees, dates, weekCells]);

  const heatAssignments = useMemo(() => {
    if (!heatOpen || !department) return [];
    const from = addDays(weekStart, -1);
    const to = addDays(weekStart, 6);
    return allAssignments.filter((a) => a.departmentId === department.id && a.date >= from && a.date <= to);
  }, [heatOpen, department, allAssignments, weekStart]);

  const todayKey = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  if (!employees.length) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <Users size={16} aria-hidden="true" className="mx-auto mb-2 text-slate-600" />
        <h2 className="text-base font-semibold text-slate-900">Nenhum funcionário neste setor</h2>
        <p className="mt-1 text-sm text-slate-600">Cadastre a equipe na aba Equipe para montar a escala.</p>
      </div>
    );
  }

  const menuEmployee = menu ? rows[menu.row] : null;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div
        ref={scrollRef}
        onKeyDown={onKeyDown}
        className="relative h-[min(72vh,52rem)] min-h-[20rem] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        <div role="grid" aria-label="Escala semanal" aria-rowcount={rows.length + 2} aria-colcount={9} style={{ minWidth: MIN_WIDTH }}>
          <div
            role="row"
            aria-rowindex={1}
            className="sticky top-0 z-30 grid border-b border-slate-300 bg-slate-100"
            style={{ gridTemplateColumns: COLS, height: HEADER_H }}
          >
            <div role="columnheader" className="sticky left-0 z-10 flex items-center border-r border-slate-300 bg-slate-100 px-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
              Funcionário
            </div>
            {dates.map((date, i) => (
              <div
                key={date}
                role="columnheader"
                aria-label={`${DAY_LONG[i]} ${formatDM(date)}`}
                className={`flex flex-col items-center justify-center text-xs ${date === todayKey ? 'bg-emerald-100 text-emerald-900' : i >= 5 ? 'text-slate-800' : 'text-slate-700'}`}
              >
                <span className="font-semibold uppercase tracking-wide">{DAY_SHORT[i]}</span>
                <span className="tabular-nums">{formatDM(date)}</span>
              </div>
            ))}
            <div role="columnheader" className="flex items-center justify-center border-l border-slate-300 text-xs font-semibold uppercase tracking-wide text-slate-700">
              Resumo
            </div>
          </div>

          <div role="rowgroup" className="relative" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const employee = rows[item.index];
              if (!employee) return null;
              return (
                <GridRow
                  key={employee.id}
                  employee={employee}
                  row={item.index}
                  start={item.start - HEADER_H}
                  activeCol={item.index === activeRow ? active.col : -1}
                  dates={dates}
                  cellIndex={cellIndex}
                  shiftById={shiftById}
                  issuesByCell={issuesByCell}
                  employeeIssues={issuesByEmployee[employee.id] ?? NO_ISSUES}
                  targetMinutes={targetMinutes}
                  onOpen={openMenu}
                />
              );
            })}
            {rows.length === 0 && <p className="p-6 text-center text-sm text-slate-600">Nenhum funcionário corresponde aos filtros.</p>}
          </div>

          <div
            role="row"
            aria-rowindex={rows.length + 2}
            className="sticky bottom-0 z-20 grid border-t border-slate-300 bg-slate-50"
            style={{ gridTemplateColumns: COLS, minHeight: FOOTER_H }}
          >
            <div role="rowheader" className="sticky left-0 z-10 flex items-center border-r border-slate-300 bg-slate-50 px-2">
              <button
                type="button"
                aria-expanded={heatOpen}
                onClick={() => onHeatOpenChange(!heatOpen)}
                className="flex items-center gap-1 rounded-md px-1 py-1 text-left text-xs font-semibold text-slate-800 hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-emerald-600"
              >
                {heatOpen ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                Cobertura por hora
              </button>
            </div>
            {dates.map((date, i) => {
              const dayIssues = validation?.issuesByDate[date] ?? NO_ISSUES;
              const text = dayIssues.map((x) => x.message).join('\n');
              return (
                <div
                  key={date}
                  role="gridcell"
                  aria-label={`${DAY_LONG[i]} ${formatDM(date)}: Trabalhando ${totals[i].work}, Folga ${totals[i].off}${dayIssues.length ? `, ${dayIssues.length} alerta${dayIssues.length > 1 ? 's' : ''} de cobertura: ${text.replace(/\n/g, '; ')}` : ''}`}
                  className="flex flex-col items-center justify-center gap-0.5 px-1 py-1 text-center text-xs text-slate-800"
                >
                  <span className="flex flex-wrap items-center justify-center gap-x-1 tabular-nums">
                    <span className="font-semibold">Trabalhando {totals[i].work}</span>
                    <span aria-hidden="true">|</span>
                    <span>Folga {totals[i].off}</span>
                  </span>
                  {dayIssues.length > 0 && (
                    <button
                      type="button"
                      title={text}
                      onClick={() => onHeatOpenChange(true)}
                      className="flex items-center gap-0.5 rounded bg-amber-100 px-1 py-0.5 font-semibold text-amber-900 ring-1 ring-amber-500 hover:bg-amber-200 focus-visible:outline-2 focus-visible:outline-emerald-600"
                    >
                      <TriangleAlert size={12} aria-hidden="true" />
                      {dayIssues.length} cobertura
                    </button>
                  )}
                </div>
              );
            })}
            <div role="gridcell" aria-hidden="true" className="border-l border-slate-300" />
          </div>
        </div>
      </div>

      {heatOpen && <CoverageHeatmap dates={dates} assignments={heatAssignments} shifts={shifts} />}

      {menu && menuEmployee && (
        <CellMenu
          key={`${menu.row}-${menu.col}`}
          employee={menuEmployee}
          date={dates[menu.col]}
          col={menu.col}
          cell={cellIndex.get(`${menuEmployee.id}|${dates[menu.col]}`)}
          shifts={shifts}
          anchor={menu.anchor}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}
