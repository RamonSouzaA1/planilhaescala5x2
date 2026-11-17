import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import App from '../../App.jsx';
import { STORAGE_KEY, useScheduleStore } from '../../store/useScheduleStore.js';
import { CORRUPTED_BACKUP_KEY } from './localData.js';

const store = () => useScheduleStore.getState();
let blobs;

beforeEach(() => {
  localStorage.clear();
  store().resetAll();
  store().setOnboarding('skipped');
  blobs = [];
  URL.createObjectURL = vi.fn((blob) => {
    blobs.push(blob);
    return 'blob:teste';
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const openPrivacy = () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Privacidade' }));
  return screen.getByRole('dialog', { name: 'Privacidade' });
};

describe('Privacidade (LGPD)', () => {
  it('abre pelo rodapé com o texto e o contato, e fecha com Esc', () => {
    const dialog = openPrivacy();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByText(/Somente neste navegador/)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'privacidade@planilhaescala5x2.com.br' })).toHaveAttribute(
      'href',
      'mailto:privacidade@planilhaescala5x2.com.br',
    );
    expect(within(dialog).getByRole('button', { name: 'Exportar meus dados' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Privacidade' })).not.toBeInTheDocument();
  });

  it('exporta todos os dados locais em JSON', async () => {
    store().loadSampleStore();
    localStorage.setItem('planilha-escala-5x2:upgrade-interest', '"sim"');
    const dialog = openPrivacy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Exportar meus dados' }));
    expect(blobs).toHaveLength(1);
    const data = JSON.parse(await blobs[0].text());
    expect(data.app).toBe('planilha-escala-5x2');
    expect(data.storage[STORAGE_KEY].state.employees).toHaveLength(26);
    expect(data.storage['planilha-escala-5x2:upgrade-interest']).toBe('sim');
    expect(data.currentState.employees).toHaveLength(26);
  });

  it('apagar exige confirmação; cancelar mantém os dados', () => {
    store().loadSampleStore();
    const dialog = openPrivacy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apagar todos os dados deste navegador' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Não dá para desfazer');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(store().employees).toHaveLength(26);
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('confirmar apaga o localStorage do app e reseta o store (onboarding volta a pending)', () => {
    store().loadSampleStore();
    store().setOnboarding('done');
    localStorage.setItem('planilha-escala-5x2:upgrade-interest', '1');
    localStorage.setItem('outro-app', 'fica');
    const dialog = openPrivacy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apagar todos os dados deste navegador' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sim, apagar tudo' }));
    expect(store().employees).toHaveLength(0);
    expect(store().departments).toHaveLength(0);
    expect(store().onboarding).toBe('pending');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem('planilha-escala-5x2:upgrade-interest')).toBeNull();
    expect(localStorage.getItem('outro-app')).toBe('fica');
    expect(within(dialog).getByRole('status')).toHaveTextContent('apagados');
  });
});

describe('store: wipeLocalData e exportLocalData', () => {
  it('exportLocalData devolve JSON mesmo sem nada salvo', () => {
    localStorage.clear();
    const data = JSON.parse(store().exportLocalData());
    expect(data.storage).toBeDefined();
    expect(data.currentState.departments).toEqual([]);
  });

  it('wipeLocalData remove também a cópia de dados corrompidos', () => {
    localStorage.setItem(CORRUPTED_BACKUP_KEY, '{ruim');
    store().wipeLocalData();
    expect(localStorage.getItem(CORRUPTED_BACKUP_KEY)).toBeNull();
  });
});

describe('reidratação protegida', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));

  const rehydrate = () => useScheduleStore.persist.rehydrate();

  it('JSON corrompido: abre vazio, sem lançar, e guarda cópia para exportar', async () => {
    localStorage.setItem(STORAGE_KEY, '{"state": {"employees": [');
    await rehydrate();
    expect(store().employees).toEqual([]);
    expect(localStorage.getItem(CORRUPTED_BACKUP_KEY)).toBe('{"state": {"employees": [');
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Planilha Escala 5x2' })).toBeInTheDocument();
  });

  it('estrutura inválida (employees não é lista): descarta o documento', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, state: { employees: 'oi', departments: [] } }));
    await rehydrate();
    expect(store().employees).toEqual([]);
    expect(store().departments).toEqual([]);
  });

  it('turno com startTime vazio é descartado e a escala renderiza sem tela branca', async () => {
    store().loadSampleStore();
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const [first, ...others] = raw.state.shifts;
    raw.state.shifts = [{ ...first, startTime: '' }, ...others];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
    await rehydrate();
    expect(store().shifts.some((s) => s.id === first.id)).toBe(false);
    expect(store().shifts).toHaveLength(others.length);
    store().setOnboarding('skipped');
    render(<App />);
    expect(screen.getByRole('combobox', { name: 'Trocar setor' })).toBeInTheDocument();
    expect(localStorage.getItem(CORRUPTED_BACKUP_KEY)).not.toBeNull();
  });
});
