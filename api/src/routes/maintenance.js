import { Router } from 'express';
import { recordAudit } from '../audit.js';
import { sendOk } from '../errors.js';
import { requireRole } from '../middleware/auth.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Remove o IP dos registros de auditoria mais antigos que a retenção configurada.
 * Pode rodar pela rota (OWNER) ou por um agendador externo chamando esta função.
 * @param {import('../repositories/index.js').Repositories['auditLogs']} auditLogs
 * @param {string} orgId
 * @param {Date} now
 * @param {number} retentionDays
 * @returns {Promise<{ purged: number, cutoff: string, retentionDays: number }>}
 */
export async function purgeAuditIps(auditLogs, orgId, now, retentionDays) {
  const cutoff = new Date(now.getTime() - retentionDays * DAY_MS).toISOString();
  return { purged: await auditLogs.purgeIps(orgId, cutoff), cutoff, retentionDays };
}

/**
 * Rotas `/api/maintenance` (somente OWNER, restritas à organização do token).
 * `POST /purge-audit-ips`: zera o IP de registros com mais de `config.auditIpRetentionDays`
 * (padrão 180; env AUDIT_IP_RETENTION_DAYS). É idempotente e só mexe no campo `ip`.
 * @param {{ repositories: import('../repositories/index.js').Repositories, config: import('../config.js').AppConfig }} deps
 * @returns {import('express').Router}
 */
export function maintenanceRoutes({ repositories, config }) {
  const router = Router();
  router.post('/purge-audit-ips', requireRole('OWNER'), async (req, res) => {
    const result = await purgeAuditIps(repositories.auditLogs, req.orgId, config.now(), config.auditIpRetentionDays);
    await recordAudit(repositories.auditLogs, req, {
      action: 'LIMPOU_IPS_AUDITORIA',
      details: { message: `IP removido de ${result.purged} registro(s) anteriores a ${result.cutoff}.`, ...result },
      now: config.now(),
    });
    sendOk(res, result);
  });
  return router;
}
