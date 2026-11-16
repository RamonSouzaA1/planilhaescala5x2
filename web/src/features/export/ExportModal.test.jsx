import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('html-to-image', () => ({ toPng: vi.fn(() => Promise.resolve('data:image/png;base64,AAAA')) }));
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,QR')) } }));

import { toPng } from 'html-to-image';
import { useScheduleStore } from '../../store/useScheduleStore.js';
import { ExportModal } from './ExportModal.jsx';

const store = () => useScheduleStore.getState();
const writeText = vi.fn(() => Promise.resolve());

beforeEach(() => {
  localStorage.clear();
  store().resetAll();
  toPng.mockClear();
  writeText.mockClear();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  store().loadSampleStore();
  store().goToWeek('2026-11-16');
  store().generateWeek();
});

const open = (onClose = () => {}) => render(<ExportModal onClose={onClose} />);
const tab = (name) => fireEvent.click(screen.getByRole('tab', { name }));
const FOOTER = 'Escala 5x2 gerada em 30s sem erro de CLT';
const UPGRADE = 'Desbloqueie sua escala';

describe('ExportModal', () => {
  it("FREE com 26: texto abre o UpgradeModal e imagem com marca d'água baixa", async () => {
    open();
    expect(screen.getByRole('dialog', { name: 'Exportar escala' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByTestId('plan-badge')).toHaveTextContent('Gratuito');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: "Baixar imagem com marca d'água" }));
    });
    expect(toPng).toHaveBeenCalledTimes(1);
    expect(toPng.mock.calls[0][1]).toMatchObject({ pixelRatio: 2, backgroundColor: '#ffffff' });

    tab('Texto para o grupo');
    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));
    const upgrade = screen.getByRole('dialog', { name: UPGRADE });
    expect(upgrade).toHaveTextContent('Sua escala de 26 funcionários está pronta');
    expect(upgrade).toHaveTextContent('Plano Líder (R$ 39,90/mês)');
    expect(upgrade).toHaveTextContent('Passe Transição 45 Dias (R$ 59,90 no Pix)');
    expect(writeText).not.toHaveBeenCalled();
  });

  it("imagem sem marca d'água e mensagens individuais também abrem o UpgradeModal", () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: "Baixar imagem sem marca d'água" }));
    expect(screen.getByRole('dialog', { name: UPGRADE })).toBeInTheDocument();
    expect(toPng).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: UPGRADE })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Exportar escala' })).toBeInTheDocument();

    tab('Mensagens individuais');
    fireEvent.click(screen.getAllByRole('button', { name: /^Copiar mensagem de/ })[0]);
    expect(screen.getByRole('dialog', { name: UPGRADE })).toBeInTheDocument();
  });

  it('plano LEADER_MONTHLY: texto liberado e sem rodapé', async () => {
    useScheduleStore.setState((s) => ({ organization: { ...s.organization, plan: 'LEADER_MONTHLY' } }));
    open();
    expect(screen.queryByRole('button', { name: /sem marca/ })).toBeNull();
    tab('Texto para o grupo');
    const area = screen.getByLabelText(/Resumo da semana/);
    expect(area.value).not.toContain(FOOTER);
    expect(area.value).toContain('*Escala Açougue — 16/11 a 22/11*');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));
    });
    expect(writeText).toHaveBeenCalledWith(area.value);
    expect(screen.getByRole('button', { name: 'Copiado!' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: UPGRADE })).toBeNull();
  });

  it('FREE com 5 funcionários: tudo liberado, com rodapé viral', async () => {
    const keep = store().employees.slice(0, 5).map((e) => e.id);
    useScheduleStore.setState((s) => ({ employees: s.employees.filter((e) => keep.includes(e.id)) }));
    store().generateWeek();
    open();
    expect(screen.queryByRole('button', { name: /sem marca/ })).toBeNull();
    tab('Texto para o grupo');
    const area = screen.getByLabelText(/Resumo da semana/);
    expect(area.value).toContain(FOOTER);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));
    });
    expect(writeText).toHaveBeenCalledTimes(1);

    tab('Mensagens individuais');
    expect(screen.getAllByRole('button', { name: /^Enviar mensagem para/ })[0]).toBeDisabled();
  });

  it('abas navegam com setas', () => {
    open();
    const first = screen.getByRole('tab', { name: 'Imagem (PNG)' });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Texto para o grupo' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toBeInTheDocument();
  });

  it('Esc fecha o modal', () => {
    const onClose = vi.fn();
    open(onClose);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('UpgradeModal', () => {
  it('informa que o Pix não está disponível, sem coletar telefone nem prometer aviso', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    open();
    tab('Texto para o grupo');
    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));
    setItem.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Quero o Plano Líder' }));
    const dialog = screen.getByRole('dialog', { name: 'Pagamento via Pix indisponível' });
    expect(dialog).toHaveTextContent('Pagamento via Pix ainda não está disponível. Obrigado pelo interesse!');
    expect(dialog).toHaveTextContent('Nenhuma cobrança foi feita.');
    expect(dialog).toHaveTextContent('Plano Líder (R$ 39,90/mês)');
    expect(dialog).not.toHaveTextContent(/WhatsApp|Avisaremos|avisado/);
    expect(within(dialog).queryByRole('textbox')).toBeNull();
    expect(dialog.querySelector('input')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Avisar-me' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Entendi' })).toHaveFocus();
    expect(setItem.mock.calls.some(([key]) => String(key).includes('upgrade-interest'))).toBe(false);
    expect(localStorage.getItem('planilha-escala-5x2:upgrade-interest')).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Voltar' }));
    expect(screen.getByRole('dialog', { name: UPGRADE })).toBeInTheDocument();
    setItem.mockRestore();
  });

  it('Entendi encerra o modal de upgrade', () => {
    open();
    tab('Texto para o grupo');
    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quero o Passe Transição' }));
    const dialog = screen.getByRole('dialog', { name: 'Pagamento via Pix indisponível' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Entendi' }));
    expect(screen.queryByRole('dialog', { name: 'Pagamento via Pix indisponível' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Exportar escala' })).toBeInTheDocument();
  });

  it('com alertas vermelhos não afirma 100% dentro da CLT', () => {
    useScheduleStore.setState((s) => ({
      assignments: s.assignments.map((a) => ({ ...a, type: 'WORK', shiftId: s.shifts[0].id })),
    }));
    open();
    tab('Texto para o grupo');
    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));
    const dialog = screen.getByRole('dialog', { name: UPGRADE });
    expect(dialog).toHaveTextContent('Sua escala de 26 funcionários está pronta.');
    expect(dialog).not.toHaveTextContent('100% dentro da CLT');
  });
});
