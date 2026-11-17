import { getEffectivePlan, isTransitionPassExpired } from '@escala/shared/utils/planPermissions.js';
import { AppError, forbidden, notFound, unauthorized } from '../errors.js';
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

    // Token emitido antes de um logout-all ou troca de senha (tokenVersion maior) está revogado.
    if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0)) throw new AppError(401, 'TOKEN_REVOKED', 'Sessão encerrada. Entre novamente.');

    req.user = user;
    next();
  };
}

/** Papéis com acesso à organização inteira; os demais ficam restritos a `user.departmentIds`. */
export const ORG_WIDE_ROLES = ['OWNER', 'STORE_MANAGER', 'HR_AUDITOR'];

/**
 * Fixa o escopo da requisição. O `organizationId` vem SEMPRE do usuário autenticado (token);
 * nunca do corpo, da query ou da URL. `req.departmentScope` é null para os papéis com acesso
 * à organização inteira e, para SECTION_LEADER (ou papel desconhecido), o conjunto de setores
 * do usuário.
 * @type {import('express').RequestHandler}
 */
export function tenantScope(req, _res, next) {
  req.orgId = req.user.organizationId;
  req.departmentScope = ORG_WIDE_ROLES.includes(req.user.role) ? null : new Set(req.user.departmentIds ?? []);
  next();
}

/**
 * Indica se o setor está no escopo da requisição.
 * @param {import('express').Request} req
 * @param {string | undefined | null} departmentId
 * @returns {boolean}
 */
export function inDepartmentScope(req, departmentId) {
  return !req.departmentScope || (Boolean(departmentId) && req.departmentScope.has(departmentId));
}

/**
 * Garante que o setor está no escopo; fora dele responde 404 (sem revelar que existe).
 * @param {import('express').Request} req
 * @param {string | undefined | null} departmentId
 */
export function assertDepartmentScope(req, departmentId) {
  if (!inDepartmentScope(req, departmentId)) throw notFound();
}

/**
 * Calcula o plano efetivo (spec 6.4, item 3). Passe Transição expirado (ou sem data) é
 * rebaixado para FREE e persistido, preservando os dados cadastrados. Assinatura EXPIRED,
 * PAST_DUE ou CANCELED vale como FREE só na requisição: o plano gravado é mantido para o
 * webhook de pagamento reativar.
 * @param {{ repositories: import('../repositories/index.js').Repositories, config: import('../config.js').AppConfig }} deps
 * @returns {import('express').RequestHandler}
 */
export function effectivePlan({ repositories, config }) {
  return async (req, _res, next) => {
    let org = await repositories.organizations.get(req.orgId);
    if (!org) throw unauthorized('Token inválido.');
    const now = config.now();
    if (isTransitionPassExpired(org, now)) {
      org = (await repositories.organizations.update(org.id, { plan: 'FREE', subscriptionStatus: 'EXPIRED' })) ?? org;
    }
    req.org = org;
    req.plan = getEffectivePlan(org, now);
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
