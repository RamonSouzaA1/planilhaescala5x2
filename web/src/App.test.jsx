import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import App from './App.jsx';
import { useScheduleStore } from './store/useScheduleStore.js';

const store = () => useScheduleStore.getState();

beforeEach(() => {
  localStorage.clear();
  store().resetAll();
  store().goToWeek('2026-11-16');
});

describe('App', () => {
  it('renderiza o título Planilha Escala 5x2', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Planilha Escala 5x2' })).toBeInTheDocument();
  });

  it('fluxo completo: estado vazio -> loja exemplo -> gerar escala -> selo verde', () => {
    render(<App />);
    expect(screen.getByText('Nenhum setor ativo')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Carregar Loja Exemplo/ }));
    expect(store().employees).toHaveLength(26);
    expect(screen.getByRole('combobox', { name: 'Trocar setor' })).toHaveDisplayValue('Açougue');

    fireEvent.click(screen.getByRole('button', { name: 'Gerar Escala Inteligente' }));
    expect(screen.getByTestId('clt-seal')).toHaveAttribute('data-status', 'GREEN');
    expect(screen.getByText('Escala 100% dentro da CLT')).toBeInTheDocument();
    expect(screen.getAllByRole('rowheader').length).toBeGreaterThan(10);
  });

  it('"Começar do zero" cria um setor', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Começar do zero' }));
    expect(store().departments).toHaveLength(1);
    expect(screen.getByRole('combobox', { name: 'Trocar setor' })).toHaveDisplayValue('Meu Setor');
  });

  it('navega entre as semanas e mostra o intervalo', () => {
    render(<App />);
    expect(screen.getByTestId('week-range')).toHaveTextContent('16/11 – 22/11/2026');
    fireEvent.click(screen.getByRole('button', { name: 'Próxima semana' }));
    expect(screen.getByTestId('week-range')).toHaveTextContent('23/11 – 29/11/2026');
    fireEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
    fireEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
    expect(screen.getByTestId('week-range')).toHaveTextContent('09/11 – 15/11/2026');
    fireEvent.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(store().currentWeekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('navega entre as abas Escala, Equipe e Turnos e Cobertura', () => {
    store().loadSampleStore();
    render(<App />);
    const tabs = screen.getByRole('tablist', { name: 'Áreas do aplicativo' });
    expect(within(tabs).getByRole('tab', { name: 'Escala' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('grid', { name: 'Escala semanal' })).toBeInTheDocument();

    fireEvent.click(within(tabs).getByRole('tab', { name: 'Equipe' }));
    expect(screen.getByRole('list', { name: 'Funcionários' })).toBeInTheDocument();
    expect(screen.queryByRole('grid')).toBeNull();

    fireEvent.click(within(tabs).getByRole('tab', { name: 'Turnos e Cobertura' }));
    expect(screen.getByRole('heading', { name: 'Setor e regras' })).toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'panel-turnos');

    fireEvent.keyDown(within(tabs).getByRole('tab', { name: 'Turnos e Cobertura' }), { key: 'ArrowRight' });
    expect(within(tabs).getByRole('tab', { name: 'Escala' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('grid', { name: 'Escala semanal' })).toBeInTheDocument();
  });

  it('botão Exportar abre um dialog', () => {
    store().loadSampleStore();
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Exportar/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
