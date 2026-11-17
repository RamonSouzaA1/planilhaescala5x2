import { describe, it, expect } from 'vitest';
import {
  getShiftNightMinutes,
  getShiftProrogatedNightMinutes,
  getShiftLegalMinutes,
  getShiftWorkMinutes,
  validateSchedule,
  ISSUE_CODES,
  SEVERITY,
} from './cltValidator.js';
import { getWeekDates } from './dateUtils.js';
import { isSundayOffWeek } from './sundayRotation.js';

/**
 * Hora noturna prorrogada (Súmula 60, II, TST): cumprida integralmente a jornada no período
 * noturno (22h–05h) e prorrogada esta, as horas após as 05h também são noturnas (52min30s).
 */

const shift = (startTime, endTime, breakDurationMinutes = 60) => ({ id: 'S', code: 'S', name: 'S', startTime, endTime, breakDurationMinutes });

describe('getShiftNightMinutes com prorrogação (Súmula 60, II)', () => {
  it.each([
    // [início, fim, minutos noturnos de relógio, dos quais prorrogados]
    ['21:00', '07:00', 9 * 60, 120], // cobre 22h–05h e prorroga até 07h
    ['22:00', '06:00', 8 * 60, 60],
    ['21:00', '06:00', 8 * 60, 60],
    ['20:00', '08:00', 10 * 60, 180],
    ['22:00', '05:00', 7 * 60, 0], // cobre a faixa, mas não prorroga
    ['20:00', '05:00', 7 * 60, 0],
  ])('%s–%s cobre toda a faixa: %i min noturnos (%i prorrogados)', (start, end, night, prorogated) => {
    expect(getShiftNightMinutes(shift(start, end))).toBe(night);
    expect(getShiftProrogatedNightMinutes(shift(start, end))).toBe(prorogated);
  });

  it.each([
    // Não cobre toda a faixa 22h–05h: nada muda.
    ['23:00', '07:00', 6 * 60], // começa depois das 22h
    ['22:30', '08:00', 6 * 60 + 30],
    ['21:00', '04:00', 6 * 60], // termina antes das 05h
    ['00:00', '08:00', 5 * 60],
    ['04:00', '12:00', 60],
    ['14:00', '23:00', 60],
    ['07:00', '16:24', 0],
  ])('%s–%s não cobre toda a faixa: %i min noturnos, sem prorrogação', (start, end, night) => {
    expect(getShiftNightMinutes(shift(start, end))).toBe(night);
    expect(getShiftProrogatedNightMinutes(shift(start, end))).toBe(0);
  });
});

describe('getShiftLegalMinutes com prorrogação', () => {
  it('21:00–07:00 com 1h de intervalo passa de 10h legais (reprodução)', () => {
    const s = shift('21:00', '07:00');
    expect(getShiftWorkMinutes(s)).toBe(540);
    // 540 min de relógio + 540 noturnos × 1/7 (52min30s) = 540 + 77 = 617 (10h17).
    expect(getShiftLegalMinutes(s)).toBe(617);
    expect(getShiftLegalMinutes(s)).toBeGreaterThan(600);
  });

  it('22:00–06:00 com 1h de intervalo: 7h de relógio + 8h noturnas reduzidas', () => {
    expect(getShiftLegalMinutes(shift('22:00', '06:00'))).toBe(420 + Math.round(480 / 7));
  });

  it('23:00–07:00 (não cobre 22h) mantém o cálculo antigo', () => {
    expect(getShiftLegalMinutes(shift('23:00', '07:00'))).toBe(420 + Math.round(360 / 7));
  });

  it('turno diurno não muda', () => {
    expect(getShiftLegalMinutes(shift('07:00', '16:24'))).toBe(504);
  });
});

describe('validateSchedule com hora noturna prorrogada', () => {
  const WEEK = '2026-11-16';
  const DATES = getWeekDates(WEEK);
  const OFF_GROUP = [1, 2, 3].find((g) => isSundayOffWeek(g, '1_IN_3', WEEK));
  const shifts = [{ ...shift('21:00', '07:00'), id: 'N10', code: 'N10' }];
  const employees = [{ id: 'ana', name: 'Ana', tags: [], sundayGroup: OFF_GROUP, status: 'ACTIVE' }];
  const assignments = ['N10', 'O', 'N10', 'O', 'O', 'O', 'O'].map((cell, i) => ({
    id: `ana-${DATES[i]}`,
    employeeId: 'ana',
    date: DATES[i],
    type: cell === 'O' ? 'OFF' : 'WORK',
    shiftId: cell === 'O' ? undefined : cell,
    isPinned: false,
  }));

  it('21:00–07:00 gera DAILY_HOURS vermelho citando a Súmula 60', () => {
    const result = validateSchedule({
      weekStartDate: WEEK,
      employees,
      shifts,
      assignments,
      department: { defaultSundayRule: '1_IN_3', weeklyHoursTarget: 42 },
    });
    const daily = result.issues.filter((i) => i.code === ISSUE_CODES.DAILY_HOURS);
    expect(daily).toHaveLength(2);
    expect(daily[0].severity).toBe(SEVERITY.RED);
    expect(daily[0].details.legalMinutes).toBe(617);
    expect(daily[0].details.prorogatedNightMinutes).toBe(120);
    expect(daily[0].message).toContain('Súmula 60');
  });
});
