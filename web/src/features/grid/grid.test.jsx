import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useScheduleStore } from '../../store/useScheduleStore.js';
import { ScheduleView } from './ScheduleView.jsx';

const store = () => useScheduleStore.getState();
const WEEK = '2026-11-16';

beforeEach(() => {
  localStorage.clear();
  store().resetAll();
  store().goToWeek(WEEK);
});

/** Carrega a loja exemplo e gera a escala da semana. */
function seedGenerated() {
  store().loadSampleStore();
  store().goToWeek(WEEK);
  store().generateWeek();
}

const bodyRows = () => screen.getAllByRole('row').filter((r) => r.querySelector('[role="rowheader"] p'));
const seal = () => screen.getByTestId('clt-seal');

/** Primeira linha com pelo menos um turno de trabalho: devolve { employee, date, cell }. */
function firstWorkCell() {
  const cell = store().assignments.find((a) => a.type === 'WORK' && a.date === WEEK);
  return { cell, employee: store().employees.find((e) => e.id === cell.employeeId) };
}

const cellEl = (employeeId, date) => document.querySelector(`[data-employee="${employeeId}"][data-date="${date}"]`);

describe('ScheduleView', () => {
  it('estado vazio oferece loja exemplo e começar do zero', () => {
    render(<ScheduleView />);
    fireEvent.click(screen.getByRole('button', { name: 'Começar do zero' }));
    expect(store().departments).toHaveLength(1);
    expect(screen.getByText('Nenhum funcionário neste setor')).toBeInTheDocument();
  });

  it('carregar loja exemplo e gerar escala deixa o selo verde e renderiza a grade', () => {
    render(<ScheduleView />);
    fireEvent.click(screen.getByRole('button', { name: /Carregar Loja Exemplo/ }));
    expect(store().employees).toHaveLength(26);
    expect(screen.getByRole('grid', { name: 'Escala semanal' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Gerar Escala Inteligente' }));
    expect(seal()).toHaveAttribute('data-status', 'GREEN');
    expect(within(seal()).getByText('Dentro da CLT')).toBeInTheDocument();
    expect(screen.getByText('Escala 100% dentro da CLT')).toBeInTheDocument();
    expect(bodyRows().length).toBeGreaterThan(10);
    expect(store().assignments.filter((a) => a.date >= WEEK)).toHaveLength(26 * 7);
    expect(screen.getAllByRole('gridcell', { name: /segunda 16\/11/ }).length).toBeGreaterThan(10);
  });

  it('célula tem aria-label descritivo com turno e horário', () => {
    seedGenerated();
    render(<ScheduleView />);
    const { cell, employee } = firstWorkCell();
    const shift = store().shifts.find((s) => s.id === cell.shiftId);
    expect(cellEl(employee.id, WEEK)).toHaveAttribute(
      'aria-label',
      expect.stringContaining(`${employee.name}, segunda 16/11: ${shift.code} ${shift.name} ${shift.startTime}–${shift.endTime}`),
    );
  });

  it('editar célula pelo menu vira Folga e o semáforo da pessoa muda', () => {
    seedGenerated();
    render(<ScheduleView />);
    const { employee } = firstWorkCell();
    const row = cellEl(employee.id, WEEK).closest('[role="row"]');
    expect(within(row).queryByRole('img', { name: /alerta/ })).toBeNull();

    fireEvent.click(cellEl(employee.id, WEEK));
    const menu = screen.getByRole('menu');
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Folga/ }));

    expect(screen.queryByRole('menu')).toBeNull();
    expect(store().assignments.find((a) => a.employeeId === employee.id && a.date === WEEK).type).toBe('OFF');
    // 3 folgas na semana: infração 5x2 (vermelho) aparece na linha e no selo.
    expect(within(row).getByRole('img', { name: /alerta vermelho/ })).toBeInTheDocument();
    expect(seal()).toHaveAttribute('data-status', 'RED');
    expect(cellEl(employee.id, WEEK)).toHaveAttribute('aria-label', expect.stringContaining('Folga'));
  });

  it('travar célula e gerar de novo mantém a trava', () => {
    seedGenerated();
    render(<ScheduleView />);
    const { employee, cell } = firstWorkCell();
    fireEvent.click(cellEl(employee.id, WEEK));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Travar célula' }));
    expect(cellEl(employee.id, WEEK)).toHaveAttribute('aria-label', expect.stringContaining('travada'));

    fireEvent.click(screen.getByRole('button', { name: 'Gerar Escala Inteligente' }));
    const after = store().assignments.find((a) => a.employeeId === employee.id && a.date === WEEK);
    expect(after).toMatchObject({ isPinned: true, type: 'WORK', shiftId: cell.shiftId });
    expect(cellEl(employee.id, WEEK)).toHaveAttribute('aria-label', expect.stringContaining('travada'));
  });

  it('Ctrl+Z desfaz, Ctrl+Y e Ctrl+Shift+Z refazem; ignora campos de texto', () => {
    seedGenerated();
    render(<ScheduleView />);
    const { employee } = firstWorkCell();
    const type = () => store().assignments.find((a) => a.employeeId === employee.id && a.date === WEEK).type;
    fireEvent.click(cellEl(employee.id, WEEK));
    fireEvent.click(screen.getByRole('menuitem', { name: /Folga/ }));
    expect(type()).toBe('OFF');

    const search = screen.getByRole('searchbox', { name: 'Buscar por nome' });
    fireEvent.keyDown(search, { key: 'z', ctrlKey: true });
    expect(type()).toBe('OFF');

    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(type()).toBe('WORK');
    fireEvent.keyDown(document.body, { key: 'y', ctrlKey: true });
    expect(type()).toBe('OFF');
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'Z', ctrlKey: true, shiftKey: true });
    expect(type()).toBe('OFF');
  });

  it('botão Desfazer reflete o histórico', () => {
    seedGenerated();
    render(<ScheduleView />);
    const undo = screen.getByRole('button', { name: 'Desfazer' });
    expect(undo).toBeEnabled();
    fireEvent.click(undo);
    expect(store().assignments).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Refazer' })).toBeEnabled();
  });

  it('só com alertas esconde todos quando a escala está verde', () => {
    seedGenerated();
    render(<ScheduleView />);
    fireEvent.click(screen.getByRole('button', { name: 'Só com alertas' }));
    expect(screen.getByText('Nenhum funcionário corresponde aos filtros.')).toBeInTheDocument();
  });

  it('só com alertas lista a pessoa com infração', () => {
    seedGenerated();
    const { employee } = firstWorkCell();
    store().setCell(employee.id, WEEK, { type: 'OFF' });
    render(<ScheduleView />);
    expect(bodyRows().length).toBeGreaterThan(1);
    fireEvent.click(screen.getByRole('button', { name: 'Só com alertas' }));
    const rows = bodyRows();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(26);
    expect(rows.some((r) => within(r).queryByText(employee.name))).toBe(true);
  });

  it('busca por nome e filtro por tag', () => {
    seedGenerated();
    render(<ScheduleView />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar por nome' }), { target: { value: 'jose antonio' } });
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText('José Antônio Ferreira')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Filtrar por tag' }), { target: { value: 'Líder' } });
    expect(bodyRows()).toHaveLength(3);
  });

  it('heatmap "Cobertura por hora" expande com 24 horas por dia', () => {
    seedGenerated();
    render(<ScheduleView />);
    expect(screen.queryByRole('table', { name: /Número de pessoas/ })).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Cobertura por hora' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader', { name: /^\d{2}h$/ })).toHaveLength(24);
    expect(within(table).getAllByRole('row')).toHaveLength(8);
    // Segunda-feira, 12h: pelo menos uma pessoa trabalhando.
    const noon = within(table).getAllByRole('cell', { name: /^12h: \d+$/ })[0];
    expect(Number(noon.textContent)).toBeGreaterThan(0);
  });

  it('rodapé mostra Trabalhando X | Folga Y por dia e o resumo por pessoa', () => {
    seedGenerated();
    render(<ScheduleView />);
    const monday = screen.getByRole('gridcell', { name: /^segunda 16\/11: Trabalhando \d+, Folga \d+/ });
    expect(monday).toHaveTextContent(/Trabalhando \d+\s*\|\s*Folga \d+/);
    expect(screen.getAllByRole('gridcell', { name: /^Resumo de .*folgas/ }).length).toBeGreaterThan(10);
  });

  it('Exportar / WhatsApp abre um dialog', () => {
    seedGenerated();
    render(<ScheduleView />);
    fireEvent.click(screen.getByRole('button', { name: /Exportar/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('Limpar semana pede confirmação', () => {
    seedGenerated();
    render(<ScheduleView />);
    fireEvent.click(screen.getByRole('button', { name: 'Limpar semana' }));
    const dialog = screen.getByRole('dialog', { name: 'Limpar semana?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(store().assignments.length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Limpar semana' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar limpeza' }));
    expect(store().assignments.filter((a) => a.date >= WEEK && a.date <= '2026-11-22')).toHaveLength(0);
  });

  it('Duplicar semana anterior copia a semana', () => {
    seedGenerated();
    store().goToWeek('2026-11-23');
    render(<ScheduleView />);
    fireEvent.click(screen.getByRole('button', { name: 'Duplicar semana anterior' }));
    expect(store().assignments.filter((a) => a.date >= '2026-11-23')).toHaveLength(26 * 7);
  });

  it('teclado: setas movem a célula ativa, Enter abre o menu e Esc fecha devolvendo o foco', () => {
    seedGenerated();
    render(<ScheduleView />);
    const cells = screen.getAllByRole('gridcell', { name: /segunda 16\/11/ });
    const first = cells[0];
    expect(first).toHaveAttribute('tabindex', '0');
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    const second = document.activeElement;
    expect(second).toHaveAttribute('data-pos', '0-1');
    expect(second).toHaveAttribute('tabindex', '0');
    expect(first).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(second, { key: 'ArrowDown' });
    expect(document.activeElement).toHaveAttribute('data-pos', '1-1');

    fireEvent.keyDown(document.activeElement, { key: 'Enter' });
    const menu = screen.getByRole('menu');
    expect(menu).toContainElement(document.activeElement);
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toHaveAttribute('data-pos', '1-1');
  });

  it('tecla P trava e destrava a célula ativa', () => {
    seedGenerated();
    render(<ScheduleView />);
    const first = screen.getAllByRole('gridcell', { name: /segunda 16\/11/ })[0];
    first.focus();
    fireEvent.keyDown(first, { key: 'p' });
    expect(store().assignments.find((a) => a.employeeId === first.dataset.employee && a.date === WEEK).isPinned).toBe(true);
    fireEvent.keyDown(first, { key: 'p' });
    expect(store().assignments.find((a) => a.employeeId === first.dataset.employee && a.date === WEEK).isPinned).toBe(false);
  });

  it('clicar num alerta do painel foca a célula correspondente', () => {
    seedGenerated();
    const { employee } = firstWorkCell();
    store().setCell(employee.id, WEEK, { type: 'OFF' });
    render(<ScheduleView />);
    const panel = screen.getByRole('complementary', { name: 'Painel do Semáforo CLT' });
    expect(within(panel).getByText('Vermelhos (infrações)')).toBeInTheDocument();
    const alert = within(panel).getAllByRole('button', { name: new RegExp(employee.name) })[0];
    fireEvent.click(alert);
    expect(document.activeElement).toHaveAttribute('data-employee', employee.id);
  });

  it('mantém a grade responsiva com 200 funcionários (virtualizada)', () => {
    store().addDepartment({ name: 'Grande' });
    store().addShift({ code: 'T1', name: 'Dia', startTime: '08:00', endTime: '17:00', color: '#2563EB' });
    store().addEmployeesBulk(Array.from({ length: 200 }, (_, i) => ({ name: `Pessoa ${String(i).padStart(3, '0')}` })));
    render(<ScheduleView />);
    const rendered = bodyRows().length;
    expect(rendered).toBeGreaterThan(5);
    expect(rendered).toBeLessThan(60);
    expect(screen.getByRole('grid')).toHaveAttribute('aria-rowcount', '202');
  });
});
