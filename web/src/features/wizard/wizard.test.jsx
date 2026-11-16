import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import App from '../../App.jsx';
import { useScheduleStore } from '../../store/useScheduleStore.js';
import { selectWeekAssignments } from '../../store/selectors.js';

const store = () => useScheduleStore.getState();
const click = (name) => fireEvent.click(screen.getByRole('button', { name }));
const next = () => click('Continuar');

beforeEach(() => {
  localStorage.clear();
  store().resetAll();
  store().goToWeek('2026-11-16');
});

function fillSector(name = 'Açougue') {
  fireEvent.change(screen.getByLabelText('Nome do setor'), { target: { value: name } });
  next();
}
function pasteNames(text = 'Ana Souza\nBruno Lima\nCarla Dias') {
  fireEvent.change(screen.getByLabelText('Lista de nomes'), { target: { value: text } });
}

describe('OnboardingWizard', () => {
  it('abre sozinho na primeira visita, em modal acessível', () => {
    render(<App />);
    const dialog = screen.getByRole('dialog', { name: 'Guia de configuração' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('progressbar', { name: 'Progresso do guia' })).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByLabelText('Nome do setor')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Pular, eu sei fazer' })).toBeInTheDocument();
  });

  it('pular grava skipped e não reabre', () => {
    const { unmount } = render(<App />);
    click('Pular, eu sei fazer');
    expect(store().onboarding).toBe('skipped');
    expect(screen.queryByRole('dialog')).toBeNull();
    unmount();
    render(<App />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('fluxo completo: setor, 3 nomes, turnos padrão, cobertura e escala gerada', () => {
    render(<App />);
    fillSector();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
    pasteNames();
    expect(screen.getByText('3 pessoas reconhecidas')).toBeInTheDocument();
    next();
    expect(store().employees).toHaveLength(3);
    click('Usar turnos padrão do varejo');
    expect(store().shifts).toHaveLength(3);
    next();
    fireEvent.change(screen.getByLabelText('Mínimo de pessoas por dia'), { target: { value: '2' } });
    next();

    expect(screen.getByRole('heading', { name: 'Tudo pronto!' })).toBeInTheDocument();
    expect(screen.getByTestId('wizard-seal')).toBeInTheDocument();
    expect(selectWeekAssignments(store())).toHaveLength(3 * 7);
    expect(store().coverageRules).toHaveLength(7);
    expect(store().departments).toHaveLength(1);

    click('Ver minha escala');
    expect(store().onboarding).toBe('done');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('grid', { name: 'Escala semanal' })).toBeInTheDocument();
  });

  it('Voltar mantém os dados digitados', () => {
    render(<App />);
    fillSector('Padaria');
    pasteNames('Ana\nBruno');
    click('Voltar');
    expect(screen.getByLabelText('Nome do setor')).toHaveValue('Padaria');
    next();
    expect(screen.getByLabelText('Lista de nomes')).toHaveValue('Ana\nBruno');
    expect(store().employees).toHaveLength(0);
  });

  it('exige o nome do setor', () => {
    render(<App />);
    next();
    expect(screen.getByRole('alert')).toHaveTextContent('Informe o nome do setor.');
    expect(store().departments).toHaveLength(0);
  });

  it('reabrir pelo Guia de configuração atualiza o setor em vez de duplicar', () => {
    store().setOnboarding('done');
    store().loadSampleStore();
    render(<App />);
    expect(screen.queryByRole('dialog')).toBeNull();
    click('Guia de configuração');
    expect(screen.getByLabelText('Nome do setor')).toHaveValue('Açougue');
    fireEvent.change(screen.getByLabelText('Nome do setor'), { target: { value: 'Açougue Novo' } });
    next();
    expect(screen.getByTestId('wizard-existing-team')).toHaveTextContent('Já cadastradas: 26');
    expect(store().departments).toHaveLength(1);
    expect(store().departments[0].name).toBe('Açougue Novo');
    expect(store().employees).toHaveLength(26);
  });

  it('quem já tem dados não vê o wizard automaticamente', () => {
    store().loadSampleStore();
    render(<App />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Usar Loja Exemplo preenche tudo e o guia gera a escala', () => {
    render(<App />);
    fillSector();
    click('Usar Loja Exemplo');
    expect(store().employees).toHaveLength(26);
    next();
    expect(screen.getByRole('list', { name: 'Turnos do setor' })).toBeInTheDocument();
    next();
    next();
    expect(screen.getByTestId('wizard-seal')).toHaveAttribute('data-status', 'GREEN');
  });

  it('Esc pede confirmação leve antes de pular', () => {
    render(<App />);
    fireEvent.keyDown(document, { key: 'Escape' });
    const alert = screen.getByRole('alertdialog');
    fireEvent.click(within(alert).getByRole('button', { name: 'Continuar o guia' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(store().onboarding).toBe('pending');
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Sim, pular o guia' }));
    expect(store().onboarding).toBe('skipped');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opções avançadas ficam recolhidas', () => {
    render(<App />);
    const details = screen.getByText('Opções avançadas').closest('details');
    expect(details).not.toHaveAttribute('open');
  });

  it('estado vazio: "Começar guiado" reabre o guia após pular', () => {
    store().setOnboarding('skipped');
    render(<App />);
    expect(screen.queryByRole('dialog')).toBeNull();
    click('Começar guiado (2 minutos)');
    expect(screen.getByRole('dialog', { name: 'Guia de configuração' })).toBeInTheDocument();
  });
});
