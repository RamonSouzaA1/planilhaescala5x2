import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useScheduleStore } from '../../store/useScheduleStore.js';
import { EmployeeForm } from './EmployeeForm.jsx';
import { PasteListModal } from './PasteListModal.jsx';

const store = () => useScheduleStore.getState();

beforeEach(() => {
  localStorage.clear();
  store().resetAll();
  store().setOnboarding('skipped');
  store().addDepartment({ name: 'Açougue' });
});

describe('EmployeeForm: telefone', () => {
  const fill = (phone) => {
    render(<EmployeeForm onClose={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'Novo funcionário' });
    fireEvent.change(within(dialog).getByLabelText(/Nome/), { target: { value: 'Ana Souza' } });
    fireEvent.change(within(dialog).getByLabelText(/Telefone/), { target: { value: phone } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    return dialog;
  };

  it('a dica diz que é opcional e usado só para enviar a escala pelo WhatsApp', () => {
    render(<EmployeeForm onClose={() => {}} />);
    expect(screen.getByText('Opcional. Usado só para enviar a escala pelo WhatsApp.')).toBeInTheDocument();
  });

  it('rejeita CPF com máscara com mensagem clara e não salva', () => {
    const dialog = fill('111.444.777-35');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('parece um CPF');
    expect(store().employees).toHaveLength(0);
  });

  it('rejeita CPF válido de 11 dígitos sem máscara', () => {
    const dialog = fill('11144477735');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('parece um CPF');
    expect(store().employees).toHaveLength(0);
  });

  it('rejeita número aleatório', () => {
    const dialog = fill('0123456789');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Telefone inválido');
  });

  it.each(['(11) 91234-5678', '+55 21 2345-6789', ''])('aceita telefone "%s"', (phone) => {
    fill(phone);
    expect(store().employees).toHaveLength(1);
  });
});

describe('PasteListModal: aviso de CPF', () => {
  const type = (text) => {
    render(<PasteListModal onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Lista de nomes'), { target: { value: text } });
  };

  it('avisa quando ignora 1 CPF e não mostra o número na pré-visualização', () => {
    type('Ana Souza - Caixa - 111.444.777-35');
    expect(screen.getByTestId('cpf-warning')).toHaveTextContent('Ignoramos 1 número que parece CPF — não precisamos dele.');
    expect(screen.getByRole('list', { name: 'Pré-visualização' })).not.toHaveTextContent('111');
  });

  it('usa o plural para vários', () => {
    type('Ana 11144477735\nBia 111.444.777-35');
    expect(screen.getByTestId('cpf-warning')).toHaveTextContent('Ignoramos 2 números que parecem CPF — não precisamos deles.');
  });

  it('sem CPF não há aviso', () => {
    type('Ana Souza; Caixa; (11) 91234-5678');
    expect(screen.queryByTestId('cpf-warning')).not.toBeInTheDocument();
  });

  it('o CPF nunca chega ao store ao confirmar', () => {
    type('Davi 111.444.777-35');
    fireEvent.click(screen.getByRole('button', { name: /Adicionar 1 pessoa/ }));
    expect(JSON.stringify(store().employees)).not.toMatch(/111\.?444|11144477735/);
    expect(store().employees[0].phone).toBeUndefined();
  });
});
