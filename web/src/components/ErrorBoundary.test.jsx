import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ErrorBoundary } from './ErrorBoundary.jsx';

function Boom() {
  throw new Error('falha-secreta-interna');
}

let blobs;
beforeEach(() => {
  localStorage.clear();
  blobs = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
  URL.createObjectURL = vi.fn((blob) => {
    blobs.push(blob);
    return 'blob:teste';
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const renderBroken = (onReload = vi.fn()) => {
  render(
    <ErrorBoundary onReload={onReload}>
      <Boom />
    </ErrorBoundary>,
  );
  return onReload;
};

describe('ErrorBoundary', () => {
  it('renderiza os filhos quando não há erro', () => {
    render(
      <ErrorBoundary>
        <p>tudo certo</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('tudo certo')).toBeInTheDocument();
  });

  it('mostra tela amigável sem stack trace e registra o erro no console', () => {
    renderBroken();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Algo deu errado ao abrir sua escala' })).toBeInTheDocument();
    expect(screen.queryByText(/falha-secreta-interna/)).not.toBeInTheDocument();
    expect(console.error).toHaveBeenCalled();
  });

  it('"Tentar de novo" recarrega', () => {
    const onReload = renderBroken();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('"Exportar meus dados" baixa o JSON do localStorage', async () => {
    localStorage.setItem('planilha-escala-5x2:v1', JSON.stringify({ state: { employees: [{ name: 'Ana' }] }, version: 1 }));
    renderBroken();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar meus dados' }));
    expect(blobs).toHaveLength(1);
    const data = JSON.parse(await blobs[0].text());
    expect(data.storage['planilha-escala-5x2:v1'].state.employees[0].name).toBe('Ana');
  });

  it('exportar sem dados avisa e não baixa nada', () => {
    renderBroken();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar meus dados' }));
    expect(blobs).toHaveLength(0);
    expect(screen.getByRole('status')).toHaveTextContent('Não há dados salvos');
  });

  it('apagar pede confirmação, e cancelar não apaga', () => {
    localStorage.setItem('planilha-escala-5x2:v1', '{}');
    const onReload = renderBroken();
    fireEvent.click(screen.getByRole('button', { name: 'Apagar dados deste navegador e recomeçar' }));
    expect(screen.getByText(/Não dá para desfazer/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(localStorage.getItem('planilha-escala-5x2:v1')).toBe('{}');
    expect(onReload).not.toHaveBeenCalled();
  });

  it('confirmar apaga as chaves do app (e só elas) e recarrega', () => {
    localStorage.setItem('planilha-escala-5x2:v1', '{}');
    localStorage.setItem('planilha-escala-5x2:upgrade-interest', '1');
    localStorage.setItem('outro-app', 'fica');
    const onReload = renderBroken();
    fireEvent.click(screen.getByRole('button', { name: 'Apagar dados deste navegador e recomeçar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sim, apagar e recomeçar' }));
    expect(localStorage.getItem('planilha-escala-5x2:v1')).toBeNull();
    expect(localStorage.getItem('planilha-escala-5x2:upgrade-interest')).toBeNull();
    expect(localStorage.getItem('outro-app')).toBe('fica');
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
