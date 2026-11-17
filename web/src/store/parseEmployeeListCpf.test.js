import { describe, it, expect } from 'vitest';
import { classifyPhone, looksLikeCpf, parseEmployeeList, parseEmployeeListDetailed } from './parseEmployeeList.js';

const VALID_CPF_BARE = '11144477735';
const VALID_CPF_MASKED = '111.444.777-35';

describe('parseEmployeeList: telefone brasileiro plausível', () => {
  it.each([
    ['celular com máscara', 'Ana Souza; Caixa; (11) 91234-5678', '(11) 91234-5678'],
    ['celular sem máscara', 'Ana Souza; Caixa; 11912345678', '11912345678'],
    ['celular com +55', 'Ana Souza - Caixa - +55 11 91234-5678', '+55 11 91234-5678'],
    ['celular com 55 colado', 'Ana Souza; Caixa; 5511912345678', '5511912345678'],
    ['fixo com máscara', 'Ana Souza; Caixa; (21) 2345-6789', '(21) 2345-6789'],
    ['fixo sem máscara', 'Ana Souza; Caixa; 1123456789', '1123456789'],
  ])('reconhece %s', (_label, line, phone) => {
    expect(parseEmployeeList(line)).toEqual([{ name: 'Ana Souza', roleTitle: 'Caixa', phone }]);
  });

  it.each([
    ['DDD com zero inicial', '0123456789'],
    ['DDD inexistente (10)', '10912345678'],
    ['só zeros', '00000000000'],
    ['celular de 11 dígitos sem o 9', '11812345678'],
    ['16 dígitos', '1234567890123456'],
    ['14 dígitos', '55119123456789'],
    ['13 dígitos que não começam com 55', '4411912345678'],
  ])('descarta número aleatório: %s', (_label, digits) => {
    const { people, ignoredCpfCount } = parseEmployeeListDetailed(`Bruno Lima; Fiscal; ${digits}`);
    expect(people).toEqual([{ name: 'Bruno Lima', roleTitle: 'Fiscal' }]);
    expect(ignoredCpfCount).toBe(0);
  });
});

describe('parseEmployeeList: CPF nunca é gravado', () => {
  it.each([
    ['com máscara', '123.456.789-09'],
    ['com máscara válida', VALID_CPF_MASKED],
    ['máscara zerada', '000.000.000-00'],
    ['11 dígitos que passam no dígito verificador', VALID_CPF_BARE],
  ])('CPF %s vira aviso e não vira telefone', (_label, cpf) => {
    const result = parseEmployeeListDetailed(`1. Carla Dias - Açougueiro - ${cpf}`);
    expect(result.people).toEqual([{ name: 'Carla Dias', roleTitle: 'Açougueiro' }]);
    expect(result.ignoredCpfCount).toBe(1);
    expect(JSON.stringify(result.people)).not.toContain(cpf.replace(/\D/g, '').slice(0, 6));
  });

  it('mantém o telefone e descarta o CPF na mesma linha', () => {
    const { people, ignoredCpfCount } = parseEmployeeListDetailed(`Davi Rocha; ${VALID_CPF_MASKED}; (11) 91234-5678`);
    expect(people).toEqual([{ name: 'Davi Rocha', phone: '(11) 91234-5678' }]);
    expect(ignoredCpfCount).toBe(1);
  });

  it('conta vários CPFs em linhas diferentes', () => {
    const text = `Ana Lima ${VALID_CPF_BARE}\nBia Reis ${VALID_CPF_MASKED}\nCris Melo`;
    const { people, ignoredCpfCount } = parseEmployeeListDetailed(text);
    expect(people.map((p) => p.name)).toEqual(['Ana Lima', 'Bia Reis', 'Cris Melo']);
    expect(ignoredCpfCount).toBe(2);
  });
});

describe('classifyPhone e looksLikeCpf', () => {
  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['(11) 91234-5678', 'ok'],
    ['+55 21 2345-6789', 'ok'],
    [VALID_CPF_MASKED, 'cpf'],
    [VALID_CPF_BARE, 'cpf'],
    ['000.000.000-00', 'cpf'],
    ['12345', 'invalid'],
    ['abc', 'invalid'],
  ])('classifica "%s" como %s', (input, expected) => {
    expect(classifyPhone(input)).toBe(expected);
  });

  it('telefone mascarado nunca é tratado como CPF', () => {
    expect(looksLikeCpf('(11) 91234-5678')).toBe(false);
  });
});
