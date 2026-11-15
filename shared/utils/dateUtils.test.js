import { describe, it, expect } from 'vitest';
import {
  addDays,
  diffDays,
  getDayOfWeek,
  getWeekDates,
  getWeekIndex,
  getCycleWeek,
  isMonday,
  timeToMinutes,
  minutesToTime,
  toDateKey,
} from './dateUtils.js';
import { isSundayOffWeek } from './sundayRotation.js';

describe('dateUtils', () => {
  it('soma dias atravessando mês e ano', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('calcula diferença em dias', () => {
    expect(diffDays('2026-11-16', '2026-11-22')).toBe(6);
    expect(diffDays('2026-11-22', '2026-11-16')).toBe(-6);
  });

  it('identifica o dia da semana', () => {
    expect(getDayOfWeek('2026-11-16')).toBe('SEG');
    expect(getDayOfWeek('2026-11-22')).toBe('DOM');
    expect(getDayOfWeek('2026-11-21')).toBe('SAB');
  });

  it('gera as 7 datas da semana a partir da segunda', () => {
    expect(getWeekDates('2026-11-16')).toEqual([
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
    ]);
  });

  it('valida segunda-feira', () => {
    expect(isMonday('2026-11-16')).toBe(true);
    expect(isMonday('2026-11-15')).toBe(false);
  });

  it('numera semanas de forma contínua e ciclo de 1 a 3', () => {
    expect(getWeekIndex('1970-01-05')).toBe(0);
    expect(getWeekIndex('1970-01-12')).toBe(1);
    const a = getCycleWeek('2026-11-16');
    const b = getCycleWeek('2026-11-23');
    const c = getCycleWeek('2026-11-30');
    const d = getCycleWeek('2026-12-07');
    expect(new Set([a, b, c])).toEqual(new Set([1, 2, 3]));
    expect(d).toBe(a);
  });

  it('converte horários', () => {
    expect(timeToMinutes('07:00')).toBe(420);
    expect(timeToMinutes('16:24')).toBe(984);
    expect(minutesToTime(984)).toBe('16:24');
  });

  it('rejeita horários inválidos', () => {
    for (const bad of ['', '7:00', '24:00', '12:60', undefined]) {
      expect(() => timeToMinutes(bad)).toThrow(/Horário inválido/);
    }
  });

  it('normaliza datas ISO com horário', () => {
    expect(toDateKey('2026-11-18T00:00:00.000Z')).toBe('2026-11-18');
    expect(toDateKey('2026-11-18')).toBe('2026-11-18');
  });

  it('cycleWeek coincide com o grupo que folga no rodízio 1 em 3', () => {
    for (let i = 0; i < 6; i += 1) {
      const week = addDays('2026-11-16', 7 * i);
      expect(isSundayOffWeek(getCycleWeek(week), '1_IN_3', week)).toBe(true);
      expect(isSundayOffWeek(getCycleWeek(week, 2), '1_IN_3', week, 2)).toBe(true);
    }
  });
});
