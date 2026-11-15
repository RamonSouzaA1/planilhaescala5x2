import { describe, it, expect } from 'vitest';
import { assignSundayGroups, isSundayOffWeek, resolveSundayRule } from './sundayRotation.js';
import { addDays } from './dateUtils.js';

const WEEK = '2026-11-16';

describe('assignSundayGroups', () => {
  it('distribui N em 3 grupos equilibrados (i mod 3 + 1)', () => {
    const employees = Array.from({ length: 26 }, (_, i) => ({ id: `e${i}` }));
    const groups = assignSundayGroups(employees);
    const counts = [1, 2, 3].map((g) => Object.values(groups).filter((x) => x === g).length);
    expect(counts).toEqual([9, 9, 8]);
    expect(groups.e0).toBe(1);
    expect(groups.e1).toBe(2);
    expect(groups.e3).toBe(1);
  });

  it('suporta 2 grupos para o rodízio 1 em 2', () => {
    const employees = Array.from({ length: 5 }, (_, i) => ({ id: `e${i}` }));
    const groups = assignSundayGroups(employees, 2);
    expect(Object.values(groups)).toEqual([1, 2, 1, 2, 1]);
  });
});

describe('resolveSundayRule', () => {
  it('regra individual tem prioridade sobre a do setor', () => {
    expect(resolveSundayRule({ customSundayRule: '1_IN_2' }, { defaultSundayRule: '1_IN_3' })).toBe('1_IN_2');
    expect(resolveSundayRule({}, { defaultSundayRule: '1_IN_2' })).toBe('1_IN_2');
    expect(resolveSundayRule({}, undefined)).toBe('1_IN_3');
  });
});

describe('isSundayOffWeek', () => {
  it('1 em 3: cada grupo folga exatamente um domingo a cada 3 semanas', () => {
    const weeks = [0, 1, 2].map((i) => addDays(WEEK, 7 * i));
    for (const group of [1, 2, 3]) {
      const offs = weeks.filter((w) => isSundayOffWeek(group, '1_IN_3', w));
      expect(offs).toHaveLength(1);
    }
    for (const w of weeks) {
      const groupsOff = [1, 2, 3].filter((g) => isSundayOffWeek(g, '1_IN_3', w));
      expect(groupsOff).toHaveLength(1);
    }
  });

  it('1 em 2: grupos 1 e 2 alternam', () => {
    const w0 = WEEK;
    const w1 = addDays(WEEK, 7);
    expect(isSundayOffWeek(1, '1_IN_2', w0)).not.toBe(isSundayOffWeek(1, '1_IN_2', w1));
    expect(isSundayOffWeek(1, '1_IN_2', w0)).not.toBe(isSundayOffWeek(2, '1_IN_2', w0));
  });

  it('regra CUSTOM não é verificada', () => {
    expect(isSundayOffWeek(1, 'CUSTOM', WEEK)).toBeNull();
  });
});
