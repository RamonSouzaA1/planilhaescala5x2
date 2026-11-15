import { describe, it, expect } from 'vitest';
import {
  PLAN_TYPES,
  SUBSCRIPTION_STATUSES,
  USER_ROLES,
  EMPLOYEE_STATUSES,
  ASSIGNMENT_TYPES,
  DAYS_OF_WEEK,
  SUNDAY_RULES,
} from './schemas.js';
import { PLAN_LIMITS } from '../utils/planPermissions.js';

const CONSTANTS = {
  PLAN_TYPES,
  SUBSCRIPTION_STATUSES,
  USER_ROLES,
  EMPLOYEE_STATUSES,
  ASSIGNMENT_TYPES,
  DAYS_OF_WEEK,
  SUNDAY_RULES,
};

describe('DAYS_OF_WEEK', () => {
  it('tem 7 itens na ordem segunda → domingo', () => {
    expect(DAYS_OF_WEEK).toHaveLength(7);
    expect([...DAYS_OF_WEEK]).toEqual(['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM']);
  });
});

describe('SUNDAY_RULES', () => {
  it('contém as três regras de domingo', () => {
    expect([...SUNDAY_RULES]).toEqual(['1_IN_3', '1_IN_2', 'CUSTOM']);
  });
});

describe('constantes congeladas', () => {
  it.each(Object.entries(CONSTANTS))('%s está congelada', (_name, value) => {
    expect(Object.isFrozen(value)).toBe(true);
  });

  it.each(Object.entries(CONSTANTS))('%s não aceita mutação', (_name, value) => {
    const before = [...value];
    expect(Reflect.set(value, 0, 'ALTERADO')).toBe(false);
    expect(Reflect.defineProperty(value, 'novo', { value: 1 })).toBe(false);
    expect([...value]).toEqual(before);
  });

  it('não aceita push em modo estrito', () => {
    expect(() => DAYS_OF_WEEK.push('X')).toThrow(TypeError);
    expect(DAYS_OF_WEEK).toHaveLength(7);
  });
});

describe('PLAN_TYPES x PLAN_LIMITS', () => {
  it('bate exatamente com as chaves de PLAN_LIMITS', () => {
    expect([...PLAN_TYPES].sort()).toEqual(Object.keys(PLAN_LIMITS).sort());
  });
});
