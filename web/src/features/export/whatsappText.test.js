import { describe, expect, it } from 'vitest';
import { VIRAL_FOOTER, buildEmployeeMessage, buildTeamSummary, normalizePhone, whatsappShareUrl } from './whatsappText.js';

const department = { id: 'd', name: 'Açougue', defaultSundayRule: '1_IN_3' };
const shifts = [
  { id: 's1', code: 'T1', name: 'Abertura', startTime: '06:00', endTime: '15:00' },
  { id: 's2', code: 'T2', name: 'Fechamento', startTime: '12:00', endTime: '21:00' },
];
const ana = { id: 'a', name: 'Ana Souza', sundayGroup: 1 };
const bia = { id: 'b', name: 'Bia Lima', sundayGroup: 2, phone: '(11) 91234-5678' };
const week = '2026-11-16';
const days = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'];
const assignments = [
  ...days.map((date, i) => ({ employeeId: 'a', date, type: i < 5 ? 'WORK' : 'OFF', shiftId: i < 5 ? 's1' : undefined })),
  ...days.map((date, i) => ({ employeeId: 'b', date, type: i === 0 ? 'OFF' : 'WORK', shiftId: i === 0 ? undefined : 's2' })),
];
const input = { department, weekStartDate: week, employees: [ana, bia], shifts, assignments };

describe('buildTeamSummary', () => {
  it('traz cabeçalho, turnos com horário e folgas', () => {
    const text = buildTeamSummary({ ...input, plan: 'LEADER_MONTHLY' });
    expect(text.split('\n')[0]).toBe('*Escala Açougue — 16/11 a 22/11*');
    expect(text).toContain('*Segunda 16/11*');
    expect(text).toContain('T1 06:00–15:00: Ana Souza');
    expect(text).toContain('T2 12:00–21:00: Bia Lima');
    expect(text).toContain('Folga: Bia Lima');
    expect(text).toContain('Folga: Ana Souza');
  });

  it('rodapé viral só no plano FREE', () => {
    expect(buildTeamSummary({ ...input, plan: 'FREE' })).toContain(VIRAL_FOOTER);
    expect(buildTeamSummary({ ...input, plan: 'LEADER_MONTHLY' })).not.toContain('planilhaescala5x2.com.br');
  });
});

describe('buildEmployeeMessage', () => {
  it('lista os 7 dias e o domingo de folga', () => {
    const text = buildEmployeeMessage({ ...input, employee: ana, plan: 'LEADER_MONTHLY' });
    expect(text.startsWith('Olá, Ana! Sua escala da semana 16/11–22/11:')).toBe(true);
    expect(text).toContain('*SEG 16/11:* T1 06:00–15:00');
    expect(text).toContain('*SÁB 21/11:* FOLGA');
    expect(text).toContain('*DOM 22/11:* FOLGA');
    expect(text).toContain('Próximo domingo de folga: *22/11*');
    expect(text.split('\n').filter((l) => /^\*(SEG|TER|QUA|QUI|SEX|SÁB|DOM)/.test(l))).toHaveLength(7);
  });

  it('inclui rodapé só no FREE', () => {
    expect(buildEmployeeMessage({ ...input, employee: bia, plan: 'FREE' })).toContain(VIRAL_FOOTER);
    expect(buildEmployeeMessage({ ...input, employee: bia, plan: 'STORE_MULTI' })).not.toContain(VIRAL_FOOTER);
  });
});

describe('whatsappShareUrl', () => {
  it('sem telefone', () => {
    expect(whatsappShareUrl('oi *tudo*')).toBe('https://wa.me/?text=oi%20*tudo*');
  });
  it('telefone só em dígitos, com prefixo 55 quando faltar', () => {
    expect(whatsappShareUrl('x', '(11) 91234-5678')).toBe('https://wa.me/5511912345678?text=x');
    expect(whatsappShareUrl('x', '+55 11 91234-5678')).toBe('https://wa.me/5511912345678?text=x');
    expect(normalizePhone('55 (55) 3333-4444')).toBe('555533334444');
    expect(normalizePhone('')).toBe('');
  });
});
