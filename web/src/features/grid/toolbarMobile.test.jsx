import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useScheduleStore } from '../../store/useScheduleStore.js';
import { ScheduleView } from './ScheduleView.jsx';

const store = () => useScheduleStore.getState();

beforeEach(() => {
  localStorage.clear();
  store().resetAll();
  store().loadSampleStore();
  store().goToWeek('2026-11-16');
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: true,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  delete window.matchMedia;
});

describe('GridToolbar no celular', () => {
  it('agrupa ações no menu "Mais ações" e fecha com Esc', () => {
    render(<ScheduleView />);
    expect(screen.queryByRole('button', { name: 'Limpar semana' })).not.toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: 'Mais ações' });
    fireEvent.click(trigger);
    expect(screen.getByRole('menuitem', { name: 'Duplicar semana anterior' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Exportar / WhatsApp' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('filtros ficam recolhidos e mostram contador de ativos', () => {
    render(<ScheduleView />);
    expect(screen.queryByRole('combobox', { name: 'Filtrar por turno' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Filtros/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Só com alertas' }));
    expect(screen.getByLabelText('1 filtro ativo')).toBeInTheDocument();
  });
});
