import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useScheduleStore } from '../../store/useScheduleStore.js';
import App from '../../App.jsx';
import { ScheduleView } from './ScheduleView.jsx';
import { currentMonthKey, formatMonthLabel } from './monthUtils.js';

const store = () => useScheduleStore.getState();
const MONTH = '2026-11';
const GRID_DAYS = 42; // 26/10 a 06/12: seis semanas inteiras

beforeEach(() => {
  localStorage.clear();
  store().resetAll();
  store().setOnboarding('skipped');
  store().loadSampleStore();
  store().goToMonth(MONTH);
  store().setViewMode('month');
});

afterEach(() => {
  delete window.matchMedia;
});

const toolbarGenerate = () => screen.getAllByRole('button', { name: 'Gerar mês' })[0];
const dialog = () => screen.getByRole('dialog');
const bodyRows = () => screen.getAllByRole('row').filter((r) => r.querySelector('[role="rowheader"] p'));
const cellEl = (employeeId, date) => document.querySelector(`[data-employee="${employeeId}"][data-date="${date}"]`);
const monthSeal = () => screen.getByTestId('month-seal');

function generateViaUi() {
  fireEvent.click(toolbarGenerate());
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Gerar mês' }));
}

describe('alternância Semana | Mês', () => {
  it('troca a grade semanal pela matriz mensal e volta', () => {
    store().setViewMode('week');
    render(<ScheduleView />);
    expect(screen.getByRole('grid', { name: 'Escala semanal' })).toBeInTheDocument();
    const group = screen.getByRole('radiogroup', { name: 'Modo de visualização' });
    expect(within(group).getByRole('radio', { name: 'Semana' })).toBeChecked();

    fireEvent.click(within(group).getByRole('radio', { name: 'Mês' }));
    expect(store().viewMode).toBe('month');
    expect(within(group).getByRole('radio', { name: 'Mês' })).toBeChecked();
    expect(screen.queryByRole('grid', { name: 'Escala semanal' })).not.toBeInTheDocument();
    expect(screen.getByTestId('month-empty')).toBeInTheDocument();

    fireEvent.click(within(group).getByRole('radio', { name: 'Semana' }));
    expect(screen.getByRole('grid', { name: 'Escala semanal' })).toBeInTheDocument();
  });

  it('setas movem a seleção do controle segmentado', () => {
    render(<ScheduleView />);
    const mes = screen.getByRole('radio', { name: 'Mês' });
    mes.focus();
    fireEvent.keyDown(mes, { key: 'ArrowLeft' });
    expect(store().viewMode).toBe('week');
    expect(screen.getByRole('radio', { name: 'Semana' })).toHaveFocus();
  });

  it('o cabeçalho anda de mês em mês no modo Mês', () => {
    render(<App />);
    expect(screen.getByTestId('month-label')).toHaveTextContent('novembro de 2026');
    fireEvent.click(screen.getByRole('button', { name: 'Próximo mês' }));
    expect(screen.getByTestId('month-label')).toHaveTextContent('dezembro de 2026');
    fireEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));
    expect(screen.getByTestId('month-label')).toHaveTextContent('outubro de 2026');
    fireEvent.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(screen.getByTestId('month-label')).toHaveTextContent(formatMonthLabel(currentMonthKey()));

    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Modo de visualização' })).getByRole('radio', { name: 'Semana' }));
    expect(screen.getByTestId('week-range')).toBeInTheDocument();
  });

  it('navegar de mês troca as colunas da matriz', () => {
    render(<ScheduleView />);
    generateViaUi();
    expect(screen.getByRole('columnheader', { name: 'terça 17/11' })).toBeInTheDocument();
    act(() => store().nextMonth());
    expect(screen.getByRole('columnheader', { name: 'terça 01/12' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'terça 17/11' })).not.toBeInTheDocument();
  });
});

describe('Gerar mês', () => {
  it('sem escala mostra o estado vazio com Gerar mês', () => {
    render(<ScheduleView />);
    const empty = screen.getByTestId('month-empty');
    expect(within(empty).getByText('Sem escala em novembro de 2026')).toBeInTheDocument();
    fireEvent.click(within(empty).getByRole('button', { name: 'Gerar mês' }));
    expect(dialog()).toBeInTheDocument();
  });

  it('a confirmação cita as semanas e Cancelar não altera nada', () => {
    render(<ScheduleView />);
    fireEvent.click(toolbarGenerate());
    expect(dialog()).toHaveTextContent(
      'Vamos gerar a escala das 6 semanas que tocam novembro (26/10 a 06/12). As células não travadas dessas semanas serão substituídas, inclusive dias de outubro/dezembro. Células travadas e ausências são mantidas.',
    );
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(store().assignments).toHaveLength(0);
    expect(screen.queryByRole('status', { name: /Mês 100%/ })).not.toBeInTheDocument();
  });

  it('gera a Loja Exemplo: selo verde, 26 pessoas e feedback', () => {
    render(<ScheduleView />);
    expect(store().employees).toHaveLength(26);
    generateViaUi();
    expect(store().assignments.filter((a) => a.date >= '2026-10-26' && a.date <= '2026-12-06')).toHaveLength(26 * GRID_DAYS);
    expect(monthSeal()).toHaveAttribute('data-status', 'GREEN');
    expect(within(monthSeal()).getByText('Mês dentro da CLT')).toBeInTheDocument();
    expect(screen.getByText('Mês 100% dentro da CLT')).toBeInTheDocument();
    expect(bodyRows().length).toBeGreaterThan(10);
    expect(screen.getByRole('grid', { name: 'Escala mensal' })).toHaveAttribute('aria-rowcount', '28');

    fireEvent.click(screen.getByRole('radio', { name: 'Por pessoa' }));
    expect(within(screen.getByRole('combobox', { name: 'Pessoa' })).getAllByRole('option')).toHaveLength(26);
  });

  it('Desfazer reverte o mês inteiro de uma vez, e Refazer devolve', () => {
    render(<ScheduleView />);
    generateViaUi();
    expect(store().assignments.length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(store().assignments).toHaveLength(0);
    expect(screen.getByTestId('month-empty')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refazer' }));
    expect(store().assignments).toHaveLength(26 * GRID_DAYS);
  });

  it('Ctrl+Z desfaz o mês', () => {
    render(<ScheduleView />);
    generateViaUi();
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(store().assignments).toHaveLength(0);
  });

  it('Limpar mês pede confirmação e avisa que apaga as travadas', () => {
    render(<ScheduleView />);
    generateViaUi();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar mês' }));
    expect(dialog()).toHaveTextContent('inclusive as travadas');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancelar' }));
    expect(store().assignments).toHaveLength(26 * GRID_DAYS);
    fireEvent.click(screen.getByRole('button', { name: 'Limpar mês' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Confirmar limpeza' }));
    expect(store().assignments).toHaveLength(0);
  });
});

describe('edição e semáforo', () => {
  /** Gera o mês e deixa a primeira pessoa com 7 dias seguidos de trabalho (9 a 15/11). */
  function seedRedWeek() {
    generateViaUi();
    const employee = store().employees[0];
    const shiftId = store().shifts[0].id;
    for (let d = 9; d <= 15; d += 1) act(() => store().setCell(employee.id, `2026-11-${String(d).padStart(2, '0')}`, { type: 'WORK', shiftId }));
    return employee;
  }

  it('dias fora do mês ficam desabilitados e não abrem o menu', () => {
    render(<ScheduleView />);
    generateViaUi();
    const employee = store().employees[0];
    const outside = cellEl(employee.id, '2026-10-26');
    expect(outside).toHaveAttribute('aria-disabled', 'true');
    expect(outside.getAttribute('aria-label')).toContain('fora do mês');
    fireEvent.click(outside);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.keyDown(outside, { key: 'Enter' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(cellEl(employee.id, '2026-11-10')).not.toHaveAttribute('aria-disabled');
  });

  it('editar uma célula vira Folga e o semáforo da pessoa muda', () => {
    render(<ScheduleView />);
    const employee = seedRedWeek();
    const badge = () => within(bodyRows().find((r) => r.textContent.includes(employee.name))).getByRole('img');
    expect(badge().getAttribute('aria-label')).toMatch(/vermelho/);
    expect(monthSeal()).toHaveAttribute('data-status', 'RED');
    const before = badge().getAttribute('aria-label');

    const cell = cellEl(employee.id, '2026-11-12');
    expect(cell.getAttribute('aria-label')).toMatch(/quinta 12\/11/);
    fireEvent.click(cell);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Folga' }));
    expect(cellEl(employee.id, '2026-11-12').getAttribute('aria-label')).toContain('Folga');
    expect(store().assignments.find((a) => a.employeeId === employee.id && a.date === '2026-11-12').type).toBe('OFF');
    expect(badge().getAttribute('aria-label')).not.toBe(before);
  });

  it('Enter abre o menu, P trava e setas movem o foco', () => {
    render(<ScheduleView />);
    generateViaUi();
    const employee = store().employees[0];
    const cell = cellEl(employee.id, '2026-10-26');
    expect(cell).toHaveAttribute('tabindex', '0');
    cell.focus();
    fireEvent.keyDown(cell, { key: 'ArrowRight' });
    expect(cellEl(employee.id, '2026-10-27')).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(cell, { key: 'End' });
    expect(cellEl(employee.id, '2026-12-06')).toHaveAttribute('tabindex', '0');

    const inMonth = cellEl(employee.id, '2026-11-03');
    fireEvent.keyDown(inMonth, { key: 'p' });
    expect(store().assignments.find((a) => a.employeeId === employee.id && a.date === '2026-11-03').isPinned).toBe(true);
    expect(cellEl(employee.id, '2026-11-03').getAttribute('aria-label')).toContain('travada');
    fireEvent.keyDown(inMonth, { key: 'Enter' });
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('"Só com alertas" mostra apenas quem tem alerta no mês', () => {
    render(<ScheduleView />);
    const employee = seedRedWeek();
    expect(bodyRows().length).toBeGreaterThan(5);
    fireEvent.click(screen.getByRole('button', { name: 'Só com alertas' }));
    const rows = bodyRows();
    expect(rows.length).toBeLessThan(5);
    expect(rows.some((r) => r.textContent.includes(employee.name))).toBe(true);
  });

  it('o painel lista os alertas por semana e clicar leva à célula', () => {
    render(<ScheduleView />);
    const employee = seedRedWeek();
    const panel = screen.getAllByRole('region', { name: 'Resumo do mês' })[0];
    expect(within(panel).getByText(/Semana 09\/11 – 15\/11/)).toBeInTheDocument();
    const item = within(panel).getAllByRole('button').find((b) => b.textContent.includes('13/11'));
    fireEvent.click(item);
    expect(cellEl(employee.id, '2026-11-13')).toHaveAttribute('tabindex', '0');
  });
});

describe('visão Por pessoa', () => {
  it('mostra o calendário do mês em sete colunas e o painel seleciona a pessoa', () => {
    render(<ScheduleView />);
    generateViaUi();
    fireEvent.click(screen.getByRole('radio', { name: 'Por pessoa' }));
    const employee = store().employees[0];
    const calendar = screen.getByRole('grid', { name: `Calendário de ${employee.name}` });
    expect(within(calendar).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM']);
    expect(within(calendar).getAllByRole('gridcell')).toHaveLength(GRID_DAYS);
    expect(cellEl(employee.id, '2026-11-17').getAttribute('aria-label')).toMatch(new RegExp(`${employee.name}, terça 17/11: `));
    expect(cellEl(employee.id, '2026-10-26')).toHaveAttribute('aria-disabled', 'true');

    // trocar de pessoa pelo seletor
    const other = store().employees[3];
    fireEvent.change(screen.getByRole('combobox', { name: 'Pessoa' }), { target: { value: other.id } });
    expect(screen.getByRole('grid', { name: `Calendário de ${other.name}` })).toBeInTheDocument();
  });

  it('clicar num alerta do painel seleciona a pessoa e foca o dia', () => {
    render(<ScheduleView />);
    generateViaUi();
    const employee = store().employees[5];
    const shiftId = store().shifts[0].id;
    for (let d = 9; d <= 15; d += 1) act(() => store().setCell(employee.id, `2026-11-${String(d).padStart(2, '0')}`, { type: 'WORK', shiftId }));
    fireEvent.click(screen.getByRole('radio', { name: 'Por pessoa' }));
    const panel = screen.getAllByRole('region', { name: 'Resumo do mês' })[0];
    const group = within(panel).getAllByText(employee.name, { selector: 'p' })[0].closest('li');
    const item = within(group).getAllByRole('button').find((b) => /^Vermelho: \d\d\/\d\d/.test(b.textContent));
    const [, day, month] = item.textContent.match(/(\d\d)\/(\d\d)/);
    fireEvent.click(item);
    expect(screen.getByRole('grid', { name: `Calendário de ${employee.name}` })).toBeInTheDocument();
    expect(cellEl(employee.id, `2026-${month}-${day}`)).toHaveAttribute('tabindex', '0');
  });

  it('no celular a visão Por pessoa é a padrão e as ações ficam recolhidas', () => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({ matches: true, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    render(<ScheduleView />);
    expect(screen.getByRole('radio', { name: 'Por pessoa' })).toBeChecked();
    expect(screen.queryByRole('button', { name: 'Limpar mês' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mais ações' }));
    expect(screen.getByRole('menuitem', { name: 'Limpar mês' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: /Só com alertas/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Filtros/ }));
    expect(screen.getByRole('button', { name: 'Só com alertas' })).toBeInTheDocument();
  });
});

describe('desempenho', () => {
  it('200 pessoas: só algumas dezenas de linhas são renderizadas', () => {
    store().addEmployeesBulk(Array.from({ length: 174 }, (_, i) => ({ name: `Extra ${String(i + 1).padStart(3, '0')}` })));
    expect(store().employees).toHaveLength(200);
    act(() => store().setCell(store().employees[0].id, '2026-11-02', { type: 'WORK', shiftId: store().shifts[0].id }));
    render(<ScheduleView />);
    const rendered = bodyRows().length;
    expect(rendered).toBeGreaterThan(5);
    expect(rendered).toBeLessThan(50);
    expect(screen.getByRole('grid', { name: 'Escala mensal' })).toHaveAttribute('aria-rowcount', '202');
  });
});
