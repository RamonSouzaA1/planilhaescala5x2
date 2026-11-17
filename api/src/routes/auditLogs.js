import { Router } from 'express';
import { found, sendOk } from '../errors.js';
import { assertDepartmentScope, requireRole } from '../middleware/auth.js';
import { auditLogQuerySchema } from '../schemas.js';

/** Papéis que consultam a trilha de auditoria (o líder só enxerga os setores dele). */
export const AUDIT_READ_ROLES = ['OWNER', 'STORE_MANAGER', 'HR_AUDITOR', 'SECTION_LEADER'];

/** Fuso fixo de Brasília (sem horário de verão desde 2019) para interpretar from/to como dias locais. */
const BRAZIL_OFFSET = '-03:00';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Início do dia local de `date` (YYYY-MM-DD) como ISO UTC. */
const startOfDay = (date) => new Date(`${date}T00:00:00.000${BRAZIL_OFFSET}`).toISOString();
/** Início do dia seguinte (limite superior exclusivo do filtro `to`). */
const startOfNextDay = (date) => new Date(new Date(`${date}T00:00:00.000${BRAZIL_OFFSET}`).getTime() + DAY_MS).toISOString();

/**
 * Rota `GET /api/audit-logs` (somente leitura). Não existe nenhuma rota que altere ou apague
 * registros: a trilha é imutável.
 * @param {{ repositories: import('../repositories/index.js').Repositories }} deps
 * @returns {import('express').Router}
 */
export function auditLogRoutes({ repositories }) {
  const router = Router();
  const { departments, auditLogs } = repositories;

  router.get('/', requireRole(...AUDIT_READ_ROLES), async (req, res) => {
    const query = auditLogQuerySchema.parse(req.query);
    let departmentIds;
    if (query.departmentId) {
      assertDepartmentScope(req, query.departmentId);
      found(await departments.get(req.orgId, query.departmentId));
      departmentIds = [query.departmentId];
    } else if (req.departmentScope) {
      departmentIds = [...req.departmentScope];
    }

    const { items, total } = await auditLogs.query(req.orgId, {
      departmentIds,
      from: query.from && startOfDay(query.from),
      to: query.to && startOfNextDay(query.to),
      limit: query.limit,
      offset: query.offset,
    });
    sendOk(res, { items, total, limit: query.limit, offset: query.offset });
  });

  return router;
}
