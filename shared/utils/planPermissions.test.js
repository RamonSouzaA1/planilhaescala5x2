import { describe, it, expect } from 'vitest';
import {
  PLAN_LIMITS,
  getPlanLimits,
  canUseFeature,
  canAddEmployee,
  canAddDepartment,
  shouldShowWatermark,
  isTransitionPassExpired,
  getEffectivePlan,
} from './planPermissions.js';

const NOW = new Date('2026-06-01T12:00:00.000Z');

describe('PLAN_LIMITS', () => {
  it('define os cinco planos da seção 6.2', () => {
    expect(Object.keys(PLAN_LIMITS)).toEqual([
      'FREE',
      'LEADER_MONTHLY',
      'TRANSITION_PASS',
      'STORE_MULTI',
      'ENTERPRISE',
    ]);
  });

  it('não permite mutar os limites (congelado em profundidade)', () => {
    expect(Object.isFrozen(PLAN_LIMITS)).toBe(true);
    expect(Object.isFrozen(PLAN_LIMITS.FREE)).toBe(true);

    expect(Reflect.set(PLAN_LIMITS, 'FREE', {})).toBe(false);
    expect(Reflect.set(PLAN_LIMITS.FREE, 'maxEmployeesPerDept', 999)).toBe(false);
    expect(Reflect.set(PLAN_LIMITS.ENTERPRISE, 'allowHistory', false)).toBe(false);

    expect(PLAN_LIMITS.FREE.maxEmployeesPerDept).toBe(10);
    expect(PLAN_LIMITS.ENTERPRISE.allowHistory).toBe(true);
  });

  it('não permite mutação em modo estrito', () => {
    expect(() => {
      PLAN_LIMITS.FREE.maxDepartments = 50;
    }).toThrow(TypeError);
    expect(PLAN_LIMITS.FREE.maxDepartments).toBe(1);
  });
});

describe('getPlanLimits', () => {
  it('retorna os limites do plano conhecido', () => {
    expect(getPlanLimits('STORE_MULTI')).toBe(PLAN_LIMITS.STORE_MULTI);
  });

  it('plano desconhecido usa FREE', () => {
    expect(getPlanLimits('PLANO_INEXISTENTE')).toBe(PLAN_LIMITS.FREE);
  });

  it('plano ausente usa FREE', () => {
    expect(getPlanLimits(undefined)).toBe(PLAN_LIMITS.FREE);
    expect(getPlanLimits(null)).toBe(PLAN_LIMITS.FREE);
  });

  it('não confunde propriedades herdadas do Object com planos', () => {
    expect(getPlanLimits('toString')).toBe(PLAN_LIMITS.FREE);
    expect(getPlanLimits('__proto__')).toBe(PLAN_LIMITS.FREE);
  });
});

describe('canUseFeature', () => {
  it('retorna true para feature liberada no plano', () => {
    expect(canUseFeature('LEADER_MONTHLY', 'allowHistory')).toBe(true);
    expect(canUseFeature('STORE_MULTI', 'allowEmployeePortal')).toBe(true);
  });

  it('retorna false para feature bloqueada no plano', () => {
    expect(canUseFeature('FREE', 'allowCleanExport')).toBe(false);
    expect(canUseFeature('TRANSITION_PASS', 'allowEmployeePortal')).toBe(false);
  });

  it('chave inexistente retorna false', () => {
    expect(canUseFeature('ENTERPRISE', 'allowTeleporte')).toBe(false);
    expect(canUseFeature('ENTERPRISE', 'toString')).toBe(false);
  });

  it('chave que não é booleana retorna false', () => {
    expect(canUseFeature('ENTERPRISE', 'maxEmployeesPerDept')).toBe(false);
  });

  it('plano desconhecido ou ausente segue os limites de FREE', () => {
    expect(canUseFeature('X', 'allowHistory')).toBe(false);
    expect(canUseFeature(undefined, 'allowCleanExport')).toBe(false);
  });
});

describe('canAddEmployee', () => {
  it('FREE com 9 funcionários pode adicionar', () => {
    expect(canAddEmployee('FREE', 9)).toBe(true);
  });

  it('FREE com 10 funcionários não pode adicionar', () => {
    expect(canAddEmployee('FREE', 10)).toBe(false);
  });

  it('FREE com 11 funcionários não pode adicionar', () => {
    expect(canAddEmployee('FREE', 11)).toBe(false);
  });

  it('planos pagos (Infinity) sempre podem adicionar', () => {
    expect(PLAN_LIMITS.LEADER_MONTHLY.maxEmployeesPerDept).toBe(Infinity);
    expect(canAddEmployee('LEADER_MONTHLY', 10_000)).toBe(true);
    expect(canAddEmployee('TRANSITION_PASS', 10_000)).toBe(true);
    expect(canAddEmployee('STORE_MULTI', 10_000)).toBe(true);
    expect(canAddEmployee('ENTERPRISE', 10_000)).toBe(true);
  });

  it('plano desconhecido com 10 funcionários usa o limite de FREE', () => {
    expect(canAddEmployee('DESCONHECIDO', 10)).toBe(false);
  });
});

describe('canAddDepartment', () => {
  it('FREE permite 0 departamento e bloqueia o segundo', () => {
    expect(canAddDepartment('FREE', 0)).toBe(true);
    expect(canAddDepartment('FREE', 1)).toBe(false);
  });

  it('STORE_MULTI permite até 6 departamentos', () => {
    expect(canAddDepartment('STORE_MULTI', 5)).toBe(true);
    expect(canAddDepartment('STORE_MULTI', 6)).toBe(false);
  });

  it('ENTERPRISE (Infinity) nunca bloqueia', () => {
    expect(PLAN_LIMITS.ENTERPRISE.maxDepartments).toBe(Infinity);
    expect(canAddDepartment('ENTERPRISE', 1_000)).toBe(true);
  });
});

describe('shouldShowWatermark', () => {
  it('FREE exibe marca d\'água', () => {
    expect(shouldShowWatermark('FREE')).toBe(true);
  });

  it('planos pagos não exibem marca d\'água', () => {
    for (const plan of ['LEADER_MONTHLY', 'TRANSITION_PASS', 'STORE_MULTI', 'ENTERPRISE']) {
      expect(shouldShowWatermark(plan)).toBe(false);
    }
  });

  it('plano desconhecido exibe marca d\'água (usa FREE)', () => {
    expect(shouldShowWatermark('XYZ')).toBe(true);
  });
});

describe('isTransitionPassExpired', () => {
  it('passe expirado (planExpiresAt no passado) retorna true', () => {
    const org = { plan: 'TRANSITION_PASS', planExpiresAt: '2026-05-01T00:00:00.000Z' };
    expect(isTransitionPassExpired(org, NOW)).toBe(true);
  });

  it('passe não expirado (planExpiresAt no futuro) retorna false', () => {
    const org = { plan: 'TRANSITION_PASS', planExpiresAt: '2026-07-01T00:00:00.000Z' };
    expect(isTransitionPassExpired(org, NOW)).toBe(false);
  });

  // Mudança (backlog item 7): passe sem data de expiração é tratado como expirado.
  it('passe sem planExpiresAt (ou com data inválida) é tratado como expirado', () => {
    expect(isTransitionPassExpired({ plan: 'TRANSITION_PASS' }, NOW)).toBe(true);
    expect(isTransitionPassExpired({ plan: 'TRANSITION_PASS', planExpiresAt: null }, NOW)).toBe(true);
    expect(isTransitionPassExpired({ plan: 'TRANSITION_PASS', planExpiresAt: 'não é data' }, NOW)).toBe(true);
  });

  it('exatamente no instante de expiração ainda não expirou (now > expiresAt)', () => {
    const org = { plan: 'TRANSITION_PASS', planExpiresAt: NOW.toISOString() };
    expect(isTransitionPassExpired(org, NOW)).toBe(false);
  });

  it('plano diferente de TRANSITION_PASS nunca expira por este critério', () => {
    const org = { plan: 'LEADER_MONTHLY', planExpiresAt: '2020-01-01T00:00:00.000Z' };
    expect(isTransitionPassExpired(org, NOW)).toBe(false);
  });

  it('usa a data atual por padrão', () => {
    const past = { plan: 'TRANSITION_PASS', planExpiresAt: '2000-01-01T00:00:00.000Z' };
    const future = { plan: 'TRANSITION_PASS', planExpiresAt: '9999-01-01T00:00:00.000Z' };
    expect(isTransitionPassExpired(past)).toBe(true);
    expect(isTransitionPassExpired(future)).toBe(false);
  });
});

describe('getEffectivePlan', () => {
  it('passe Transição expirado vira FREE', () => {
    const org = { plan: 'TRANSITION_PASS', planExpiresAt: '2026-05-01T00:00:00.000Z' };
    expect(getEffectivePlan(org, NOW)).toBe('FREE');
  });

  it('passe Transição não expirado mantém o plano', () => {
    const org = { plan: 'TRANSITION_PASS', planExpiresAt: '2026-07-01T00:00:00.000Z' };
    expect(getEffectivePlan(org, NOW)).toBe('TRANSITION_PASS');
  });

  it('plano ausente ou desconhecido vira FREE', () => {
    expect(getEffectivePlan(undefined, NOW)).toBe('FREE');
    expect(getEffectivePlan({}, NOW)).toBe('FREE');
    expect(getEffectivePlan({ plan: 'GOLD' }, NOW)).toBe('FREE');
  });

  it('demais planos retornam organization.plan', () => {
    expect(getEffectivePlan({ plan: 'ENTERPRISE' }, NOW)).toBe('ENTERPRISE');
    expect(getEffectivePlan({ plan: 'LEADER_MONTHLY', planExpiresAt: '2020-01-01' }, NOW)).toBe(
      'LEADER_MONTHLY',
    );
  });

  it('passe Transição sem planExpiresAt vira FREE', () => {
    expect(getEffectivePlan({ plan: 'TRANSITION_PASS' }, NOW)).toBe('FREE');
  });

  it('assinatura EXPIRED, PAST_DUE ou CANCELED rebaixa planos pagos para FREE', () => {
    for (const subscriptionStatus of ['EXPIRED', 'PAST_DUE', 'CANCELED']) {
      for (const plan of ['LEADER_MONTHLY', 'STORE_MULTI', 'ENTERPRISE']) {
        expect(getEffectivePlan({ plan, subscriptionStatus }, NOW), `${plan}/${subscriptionStatus}`).toBe('FREE');
      }
      const validPass = { plan: 'TRANSITION_PASS', planExpiresAt: '2026-07-01T00:00:00.000Z', subscriptionStatus };
      expect(getEffectivePlan(validPass, NOW)).toBe('FREE');
    }
  });

  it('assinatura ACTIVE (ou sem status) mantém o plano', () => {
    expect(getEffectivePlan({ plan: 'STORE_MULTI', subscriptionStatus: 'ACTIVE' }, NOW)).toBe('STORE_MULTI');
    expect(getEffectivePlan({ plan: 'STORE_MULTI' }, NOW)).toBe('STORE_MULTI');
    expect(getEffectivePlan({ plan: 'FREE', subscriptionStatus: 'CANCELED' }, NOW)).toBe('FREE');
  });
});
