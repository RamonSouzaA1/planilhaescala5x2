import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { getEffectivePlan } from '@escala/shared/utils/planPermissions.js';
import { recordAudit } from '../audit.js';
import { AppError, sendOk, unauthorized } from '../errors.js';
import { effectivePlan, requireAuth, tenantScope } from '../middleware/auth.js';
import { changePasswordSchema, loginSchema, registerSchema } from '../schemas.js';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../security/password.js';
import { signToken } from '../security/tokens.js';

const REFERRAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Código de indicação de 8 caracteres, sem caracteres ambíguos. */
function randomReferralCode() {
  return Array.from(randomBytes(8), (b) => REFERRAL_ALPHABET[b % REFERRAL_ALPHABET.length]).join('');
}

/** Gera um referralCode único (reprocura em caso de colisão). */
async function uniqueReferralCode(organizations) {
  for (let i = 0; i < 5; i += 1) {
    const code = randomReferralCode();
    if (!(await organizations.findByReferralCode(code))) return code;
  }
  throw new AppError(500, 'INTERNAL_ERROR', 'Erro interno do servidor.');
}

/** Usuário sem o hash da senha. */
export function publicUser(user) {
  const { passwordHash: _hash, tokenVersion: _tv, ...safe } = user;
  return safe;
}

/** Organização com o plano efetivo. */
function publicOrg(org, now) {
  return {
    id: org.id,
    name: org.name,
    plan: getEffectivePlan(org, now),
    subscriptionStatus: org.subscriptionStatus,
    planExpiresAt: org.planExpiresAt,
    referralCode: org.referralCode,
    bonusDaysAccumulated: org.bonusDaysAccumulated,
  };
}

/**
 * Rotas `/api/auth`: register, login e me.
 * @param {{ repositories: import('../repositories/index.js').Repositories, config: import('../config.js').AppConfig }} deps
 * @returns {import('express').Router}
 */
export function authRoutes(deps) {
  const { repositories, config } = deps;
  const router = Router();

  router.post('/register', async (req, res) => {
    const input = registerSchema.parse(req.body ?? {});
    if (await repositories.users.findByEmail(input.email)) {
      throw new AppError(409, 'EMAIL_IN_USE', 'Já existe uma conta com este e-mail.');
    }
    const referredBy = input.referredByCode
      ? await repositories.organizations.findByReferralCode(input.referredByCode.toUpperCase())
      : null;

    const { organization, user } = await repositories.accounts.register({
      organization: {
        name: input.organizationName ?? `Organização de ${input.name}`,
        plan: 'FREE',
        subscriptionStatus: 'ACTIVE',
        referralCode: await uniqueReferralCode(repositories.organizations),
        referredByCode: referredBy?.referralCode,
        bonusDaysAccumulated: 0,
      },
      user: { name: input.name, email: input.email, passwordHash: await hashPassword(input.password), role: 'OWNER' },
    });

    sendOk(res, { token: signToken(user, config.jwtSecret), user: publicUser(user), organization: publicOrg(organization, config.now()) }, 201);
  });

  router.post('/login', async (req, res) => {
    const input = loginSchema.parse(req.body ?? {});
    const user = await repositories.users.findByEmail(input.email);
    // Sempre calcula o hash (mesmo sem usuário) para não revelar a existência do e-mail pelo tempo.
    const valid = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha inválidos.');
    const organization = await repositories.organizations.get(user.organizationId);
    if (!organization) throw unauthorized();
    sendOk(res, { token: signToken(user, config.jwtSecret), user: publicUser(user), organization: publicOrg(organization, config.now()) });
  });

  router.get('/me', requireAuth(deps), tenantScope, effectivePlan(deps), (req, res) => {
    sendOk(res, { user: publicUser(req.user), organization: publicOrg(req.org, config.now()) });
  });

  /** Encerra todas as sessões do usuário (inclusive esta): tokens antigos passam a dar TOKEN_REVOKED. */
  router.post('/logout-all', requireAuth(deps), async (req, res) => {
    await repositories.users.bumpTokenVersion(req.user.id);
    await recordAudit(repositories.auditLogs, req, { action: 'ENCERROU_SESSOES', details: 'Todas as sessões do usuário foram encerradas.', now: config.now() }, req.user.organizationId);
    res.status(204).end();
  });

  /** Troca a senha (exige a atual), revoga os tokens anteriores e devolve um token novo. */
  router.post('/change-password', requireAuth(deps), async (req, res) => {
    const input = changePasswordSchema.parse(req.body ?? {});
    if (!(await verifyPassword(input.currentPassword, req.user.passwordHash))) {
      throw new AppError(403, 'INVALID_PASSWORD', 'A senha atual está incorreta.');
    }
    const user = await repositories.users.changePassword(req.user.id, await hashPassword(input.newPassword));
    await recordAudit(repositories.auditLogs, req, { action: 'ALTEROU_SENHA', details: 'Senha alterada; sessões anteriores encerradas.', now: config.now() }, req.user.organizationId);
    sendOk(res, { token: signToken(user, config.jwtSecret) });
  });

  return router;
}
