import { getEffectivePlan } from '@escala/shared/utils/planPermissions.js';
import { AppError, forbidden, unauthorized } from '../errors.js';
import { verifyToken } from '../security/tokens.js';

/**
 * Valida o JWT (Bearer), confere que o usuário ainda existe e pertence à organização do token
 * e preenche `req.user`.
 * @param {{ repositories: import('../repositories/index.js').Repositories, config: import('../config.js').AppConfig }} deps
 * @returns {import('express').RequestHandler}
 */
export function requireAuth({ repositories, config }) {
  return async (req, _res, next) => {
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw unauthorized();

    let payload;
    try {
      payload = verifyToken(token, config.jwtSecret);
    } catch (error) {
      if (error?.name === 'TokenExpiredError') throw new AppError(401, 'TOKEN_EXPIRED', 'Sessão expirada. Entre novamente.');
      throw unauthorized('Token inválido.');
    }

    const user = payload.sub ? await repositories.users.get(payload.sub) : null;
    if (!user || user.organizationId !== payload.organizationId) throw unauthorized('Token inválido.');

    req.user = user;
    next();
  };
}

/**
 * Fixa o escopo de organização da requisição. O `organizationId` vem SEMPRE do usuário
 * autenticado (token); nunca do corpo, da query ou da URL.
 * @type {import('express').RequestHandler}
 */
export function tenantScope(req, _res, next) {
  req.orgId = req.user.organizationId;
  next();
}

/**
 * Calcula o plano efetivo (spec 6.4, item 3). Se o Passe Transição expirou, rebaixa a
 * organização para FREE e persiste, preservando os dados cadastrados.
 * @param {{ repositories: import('../repositories/index.js').Repositories, config: import('../config.js').AppConfig }} deps
 * @returns {import('express').RequestHandler}
 */
export function effectivePlan({ repositories, config }) {
  return async (req, _res, next) => {
    let org = await repositories.organizations.get(req.orgId);
    if (!org) throw unauthorized('Token inválido.');
    const plan = getEffectivePlan(org, config.now());
    if (plan !== org.plan) {
      org = (await repositories.organizations.update(org.id, { plan, subscriptionStatus: 'EXPIRED' })) ?? org;
    }
    req.org = org;
    req.plan = plan;
    next();
  };
}

/**
 * Restringe a rota aos papéis informados.
 * @param {...string} roles
 * @returns {import('express').RequestHandler}
 */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!roles.includes(req.user?.role)) throw forbidden();
    next();
  };
}

/** Papéis que podem alterar dados (HR_AUDITOR é somente leitura). */
export const WRITE_ROLES = ['OWNER', 'STORE_MANAGER', 'SECTION_LEADER'];
/** Papéis que gerenciam setores. */
export const MANAGER_ROLES = ['OWNER', 'STORE_MANAGER'];
