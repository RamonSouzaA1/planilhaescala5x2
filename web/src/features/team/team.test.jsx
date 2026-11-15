import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useScheduleStore } from '../../store/useScheduleStore.js';
import { TeamPanel } from './TeamPanel.jsx';
import { AbsencesPanel } from './AbsencesPanel.jsx';

const store = () => useScheduleStore.getState();
const list = () => screen.getByRole('list', { name: 'Funcionários' });
const rows = () => Array.from(list().children);

beforeEach(() => {
  localStorage.clear();
  store().resetAll();
});

function seedDepartment() {
  store().addDepartment({ name: 'Açougue' });
}

describe('TeamPanel', () => {
  it('estado vazio -> carregar loja exemplo -> 26 itens', () => {
    render(<TeamPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Carregar Loja Exemplo/ }));
    expect(rows()).toHaveLength(26);
    expect(screen.getByText('≈ 18')).toBeInTheDocument();
  });

  it('adiciona funcionário pelo formulário e valida nome vazio', () => {
    seedDepartment();
    render(<TeamPanel />);
    const opener = screen.getByRole('button', { name: 'Adicionar funcionário' });
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Novo funcionário' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Informe o nome');
    expect(store().employees).toHaveLength(0);

    fireEvent.change(within(dialog).getByLabelText('Nome *'), { target: { value: 'Ana Souza' } });
    fireEvent.change(within(dialog).getByLabelText('Função'), { target: { value: 'Caixa' } });
    const tag = within(dialog).getByLabelText('Tags');
    fireEvent.change(tag, { target: { value: 'Abertura' } });
    fireEvent.keyDown(tag, { key: 'Enter' });
    fireEvent.click(within(dialog).getByLabelText('Ter'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(store().employees).toHaveLength(1);
    expect(store().employees[0]).toMatchObject({
      name: 'Ana Souza',
      roleTitle: 'Caixa',
      tags: ['Abertura'],
      fixedConstraints: { unavailableDays: ['TER'], unavailableShiftIds: [] },
    });
    expect(rows()).toHaveLength(1);
  });

  it('busca filtra por nome, função e tag', () => {
    render(<TeamPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Carregar Loja Exemplo/ }));
    const search = screen.getByLabelText('Buscar por nome, função ou tag');
    fireEvent.change(search, { target: { value: 'serra' } });
    expect(rows()).toHaveLength(5);
    fireEvent.change(search, { target: { value: 'balconista' } });
    expect(rows()).toHaveLength(10);
    fireEvent.change(search, { target: { value: 'jose antonio' } });
    expect(rows()).toHaveLength(1);
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.getByText(/Nenhum funcionário encontrado/)).toBeInTheDocument();
  });

  it('colar lista com 3 nomes adiciona 3 funcionários', () => {
    seedDepartment();
    render(<TeamPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Colar Lista de Nomes' }));
    const dialog = screen.getByRole('dialog', { name: 'Colar Lista de Nomes' });
    fireEvent.change(within(dialog).getByLabelText('Lista de nomes'), {
      target: { value: '1. Ana Souza - Caixa\n2. Bruno Lima\n3) Carla Dias' },
    });
    expect(within(dialog).getByRole('status')).toHaveTextContent('3 pessoas reconhecidas');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Adicionar 3 pessoas' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(store().employees.map((e) => e.name)).toEqual(['Ana Souza', 'Bruno Lima', 'Carla Dias']);
    expect(store().past).toHaveLength(2); // setor + um único passo para os 3 nomes
  });

  it('muda o status do funcionário', () => {
    store().addDepartment({ name: 'A' });
    store().addEmployee({ name: 'Ana Souza' });
    render(<TeamPanel />);
    fireEvent.change(screen.getByLabelText('Status de Ana Souza'), { target: { value: 'VACATION' } });
    expect(store().employees[0].status).toBe('VACATION');
    expect(screen.getByLabelText('Status de Ana Souza')).toHaveValue('VACATION');
  });

  it('remove com confirmação (e cancelar não remove)', () => {
    store().addDepartment({ name: 'A' });
    store().addEmployeesBulk([{ name: 'Ana Souza' }, { name: 'Bruno Lima' }]);
    render(<TeamPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover Ana Souza' }));
    let dialog = screen.getByRole('dialog', { name: 'Remover funcionário' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(store().employees).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Remover Ana Souza' }));
    dialog = screen.getByRole('dialog', { name: 'Remover funcionário' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remover' }));
    expect(store().employees.map((e) => e.name)).toEqual(['Bruno Lima']);
    expect(rows()).toHaveLength(1);
  });

  it('Esc fecha o modal e devolve o foco ao botão que abriu', () => {
    seedDepartment();
    render(<TeamPanel />);
    const opener = screen.getByRole('button', { name: 'Adicionar funcionário' });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome *')).toHaveFocus();
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });
});

describe('AbsencesPanel', () => {
  function seed() {
    store().addDepartment({ name: 'A' });
    store().addEmployeesBulk([{ name: 'Ana Souza' }]);
  }
  const fill = (start, end) => {
    fireEvent.change(screen.getByLabelText('Funcionário'), { target: { value: store().employees[0].id } });
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: start } });
    fireEvent.change(screen.getByLabelText('Fim'), { target: { value: end } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar ausência' }));
  };

  it('fim anterior ao início mostra erro e não grava', () => {
    seed();
    render(<AbsencesPanel />);
    fill('2026-12-10', '2026-12-01');
    expect(screen.getByRole('alert')).toHaveTextContent('não pode ser anterior');
    expect(store().absences).toHaveLength(0);
  });

  it('adiciona, ordena por data e remove ausência', () => {
    seed();
    render(<AbsencesPanel />);
    expect(screen.getByText(/A grade bloqueia esses dias automaticamente/)).toBeInTheDocument();
    fill('2026-12-10', '2026-12-20');
    fill('2026-12-01', '2026-12-03');
    expect(store().absences).toHaveLength(2);
    const items = within(screen.getByRole('list', { name: 'Ausências do setor' })).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('01/12/2026 a 03/12/2026');
    expect(items[1]).toHaveTextContent('10/12/2026 a 20/12/2026');
    fireEvent.click(screen.getByRole('button', { name: /Remover ausência de Ana Souza \(01\/12\/2026\)/ }));
    expect(store().absences).toHaveLength(1);
  });
});
