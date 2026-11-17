import { anonymizeIp } from './security/ip.js';

/**
 * Grava uma entrada na trilha de auditoria (única porta de escrita das rotas). O IP é anonimizado
 * aqui, antes de chegar ao repositório; `details` aceita texto ou objeto (vira JSON).
 * @param {import('./repositories/index.js').Repositories['auditLogs']} auditLogs
 * @param {import('express').Request & { orgId?: string }} req
 * @param {{ departmentId?: string, action: string, details: string | object, now?: Date }} entry
 * @param {string} [organizationId] - padrão: `req.orgId`
 */
export function recordAudit(auditLogs, req, { departmentId, action, details, now = new Date() }, organizationId = req.orgId) {
  return auditLogs.create(organizationId, {
    departmentId,
    userId: req.user.id,
    action,
    details: typeof details === 'string' ? details : JSON.stringify(details),
    ip: anonymizeIp(req.ip),
    timestamp: now.toISOString(),
  });
}
