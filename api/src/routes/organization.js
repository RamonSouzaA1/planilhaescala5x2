import { Router } from 'express';
import { recordAudit } from '../audit.js';
import { AppError, found } from '../errors.js';
import { requireRole } from '../middleware/auth.js';
import { deleteOrganizationSchema } from '../schemas.js';
import { verifyPassword } from '../security/password.js';

/** Campos que nunca saem na exportação: hashes de senha, tokens de acesso e dados de pagamento sensíveis. */
const SECRET_KEYS = new Set([
  'passwordHash',
  'tokenVersion',
  'accessToken',
  'gatewayCustomerId',
  'gatewaySubscriptionId',
  'pixQrCode',
  'pixCopyPaste',
]);

/** Cópia profunda sem os campos secretos. */
export function omitSecrets(value) {
  if (Array.isArray(value)) return value.map(omitSecrets);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SECRET_KEYS.has(key))
        .map(([key, v]) => [key, omitSecrets(v)]),
    );
  }
  return value;
}

/**
 * Rotas `/api/organizations/me` (LGPD, só OWNER): exportação de portabilidade e exclusão.
 * O alvo é sempre a organização do token; não há id na URL.
 * @param {{ repositories: import('../repositories/index.js').Repositories, config: import('../config.js').AppConfig }} deps
 * @returns {import('express').Router}
 */
export function organizationRoutes({ repositories, config }) {
  const router = Router();
  const { organizations, auditLogs } = repositories;

  router.get('/me/export', requireRole('OWNER'), async (req, res) => {
    await recordAudit(auditLogs, req, { action: 'EXPORTOU_DADOS', details: 'Exportação de portabilidade dos dados da organização.', now: config.now() });
    const data = found(await organizations.exportData(req.orgId));
    const exportedAt = config.now();
    const body = { format: 'planilhaescala5x2-export-v1', exportedAt: exportedAt.toISOString(), ...omitSecrets(data) };
    res
      .set('Content-Type', 'application/json; charset=utf-8')
      .set('Content-Disposition', `attachment; filename="planilhaescala5x2-dados-${exportedAt.toISOString().slice(0, 10)}.json"`)
      .send(JSON.stringify(body, null, 2));
  });

  router.delete('/me', requireRole('OWNER'), async (req, res) => {
    const { password } = deleteOrganizationSchema.parse(req.body ?? {});
    if (!(await verifyPassword(password, req.user.passwordHash))) {
      throw new AppError(403, 'INVALID_PASSWORD', 'Senha incorreta. A organização não foi excluída.');
    }
    found((await organizations.remove(req.orgId)) || null);
    res.status(204).end();
  });

  return router;
}
