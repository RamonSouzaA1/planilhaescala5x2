import { Router } from 'express';
import { recordAudit } from '../audit.js';
import { AppError, found, sendOk } from '../errors.js';
import { requireRole } from '../middleware/auth.js';
import { userCreateSchema } from '../schemas.js';
import { hashPassword } from '../security/password.js';
import { publicUser } from './auth.js';

/**
 * Rotas `/api/users`: cadastro de usuários da organização pelo OWNER.
 * O líder de setor (SECTION_LEADER) nasce com `departmentIds` e só opera nesses setores;
 * os demais papéis atuam na organização inteira (a lista de setores é ignorada).
 * @param {{ repositories: import('../repositories/index.js').Repositories }} deps
 * @returns {import('express').Router}
 */
export function userRoutes({ repositories }) {
  const router = Router();
  const { departments, users, auditLogs } = repositories;

  router.post('/', requireRole('OWNER'), async (req, res) => {
    const input = userCreateSchema.parse(req.body ?? {});
    const departmentIds = input.role === 'SECTION_LEADER' ? [...new Set(input.departmentIds)] : [];
    for (const id of departmentIds) found(await departments.get(req.orgId, id));
    if (await users.findByEmail(input.email)) {
      throw new AppError(409, 'EMAIL_IN_USE', 'Já existe uma conta com este e-mail.');
    }

    const user = await users.create(req.orgId, {
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      departmentIds,
    });
    await recordAudit(auditLogs, req, { action: 'CRIOU_USUARIO', details: `Usuário ${user.email} criado com o papel ${user.role}.` });
    sendOk(res, publicUser(user), 201);
  });

  return router;
}
