import { describe, it, expect } from 'vitest';
import { parseEmployeeList } from './parseEmployeeList.js';

describe('parseEmployeeList', () => {
  it('lista numerada com ponto', () => {
    expect(parseEmployeeList('1. João Silva\n2. Maria Souza')).toEqual([{ name: 'João Silva' }, { name: 'Maria Souza' }]);
  });
  it('numeração com parêntese e zero à esquerda com hífen', () => {
    expect(parseEmployeeList('1) Ana Lima\n01 - Pedro Alves')).toEqual([{ name: 'Ana Lima' }, { name: 'Pedro Alves' }]);
  });
  it('marcadores -, • e *', () => {
    expect(parseEmployeeList('- Carlos\n• Beatriz\n* Diego')).toEqual([{ name: 'Carlos' }, { name: 'Beatriz' }, { name: 'Diego' }]);
  });
  it('nome - função', () => {
    expect(parseEmployeeList('João Silva - Açougueiro')).toEqual([{ name: 'João Silva', roleTitle: 'Açougueiro' }]);
  });
  it('nome ; função ; telefone', () => {
    expect(parseEmployeeList('Maria Souza; Balconista; 11999998888')).toEqual([
      { name: 'Maria Souza', roleTitle: 'Balconista', phone: '11999998888' },
    ]);
  });
  it('separado por tab (colado do Excel)', () => {
    expect(parseEmployeeList('Paulo Gomes\tEncarregado\t(11) 98888-7777')).toEqual([
      { name: 'Paulo Gomes', roleTitle: 'Encarregado', phone: '(11) 98888-7777' },
    ]);
  });
  it('separado por vírgula com telefone formatado', () => {
    expect(parseEmployeeList('Lucia Reis, Açougueira, 11 98888-7777')).toEqual([
      { name: 'Lucia Reis', roleTitle: 'Açougueira', phone: '11 98888-7777' },
    ]);
  });
  it('nome - telefone sem função', () => {
    expect(parseEmployeeList('Rafael Cruz - (21) 99999-0000')).toEqual([{ name: 'Rafael Cruz', phone: '(21) 99999-0000' }]);
  });
  it('numeração + função + telefone em linha completa', () => {
    expect(parseEmployeeList('3. Tiago Melo - Balconista - 11977776666')).toEqual([
      { name: 'Tiago Melo', roleTitle: 'Balconista', phone: '11977776666' },
    ]);
  });
  it('remove linhas vazias, normaliza espaços e CRLF', () => {
    expect(parseEmployeeList('\r\n  Ana    Maria   Costa  \r\n\r\n   \r\nJosé\r\n')).toEqual([
      { name: 'Ana Maria Costa' },
      { name: 'José' },
    ]);
  });
  it('hífen dentro do nome não separa; número curto não é telefone', () => {
    expect(parseEmployeeList('Ana-Maria Lopes - Caixa 12')).toEqual([{ name: 'Ana-Maria Lopes', roleTitle: 'Caixa 12' }]);
  });
  it('entrada vazia ou inválida', () => {
    expect(parseEmployeeList('')).toEqual([]);
    expect(parseEmployeeList(null)).toEqual([]);
  });
});
