import { Router } from 'express';
import { canAddDepartment } from '@escala/shared/utils/planPermissions.js';
import { AppError, found, sendOk } from '../errors.js';
import { MANAGER_ROLES, requireRole, WRITE_ROLES } from '../middleware/auth.js';
import {
  absenceSchema,
  absenceUpdateSchema,
  departmentSchema,
  employeeSchema,
  employeeUpdateSchema,
  shiftSchema,
  shiftUpdateSchema,
} from '../schemas.js';
import { randomBytes } from 'node:crypto';

/** Mantém só as chaves enviadas no corpo (defaults do zod não podem sobrescrever o registro em PATCH). */
const onlyProvided = (patch, body = {}) => Object.fromEntries(Object.entries(patch).filter(([key]) => key in body));

const asString = (value) => (typeof value === 'string' && value ? value : undefined);

/**
 * Rotas de departamentos, funcionários, turnos e ausências. Todas assumem que
 * `requireAuth`, `tenantScope` e `effectivePlan` já rodaram: `req.orgId` vem do token.
 * @param {{ repositories: import('../repositories/index.js').Repositories, config: import('../config.js').AppConfig }} deps
 * @returns {{ departments: Router, employees: Router, shifts: Router, absences: Router }}
 */
export function resourceRoutes({ repositories, config }) {
  const { departments, employees, shifts, absences } = repositories;
  /** Departamento da organização do token, ou 404. */
  const ownDepartment = async (orgId, id) => found(await departments.get(orgId, id));

  // ---- Departamentos ----
  const departmentRouter = Router();
  departmentRouter.get('/', async (req, res) => sendOk(res, await departments.list(req.orgId)));
  departmentRouter.get('/:id', async (req, res) => sendOk(res, await ownDepartment(req.orgId, req.params.id)));
  departmentRouter.post('/', requireRole(...MANAGER_ROLES), async (req, res) => {
    const data = departmentSchema.parse(req.body ?? {});
    if (!canAddDepartment(req.plan, await departments.count(req.orgId))) {
      throw new AppError(403, 'PLAN_LIMIT_DEPARTMENTS', 'O plano atual não permite mais setores. Faça upgrade para adicionar outro.');
    }
    sendOk(res, await departments.create(req.orgId, data), 201);
  });
  const updateDepartment = async (req, res) => {
    const patch = onlyProvided(departmentSchema.partial().parse(req.body ?? {}), req.body);
    sendOk(res, found(await departments.update(req.orgId, req.params.id, patch)));
  };
  departmentRouter.put('/:id', requireRole(...MANAGER_ROLES), updateDepartment);
  departmentRouter.patch('/:id', requireRole(...MANAGER_ROLES), updateDepartment);
  departmentRouter.delete('/:id', requireRole(...MANAGER_ROLES), async (req, res) => {
    found((await departments.remove(req.orgId, req.params.id)) || null);
    sendOk(res, { id: req.params.id, deleted: true });
  });

  // ---- Funcionários ----
  // Não há bloqueio acima de 10 no plano FREE: o paywall fica na exportação (spec 6.3).
  const employeeRouter = Router();
  const withMagicLink = (employee) => ({
    ...employee,
    magicLinkUrl: `${config.publicAppUrl}/minha-escala/${employee.accessToken}`,
  });
  employeeRouter.get('/', async (req, res) => {
    const departmentId = asString(req.query.departmentId);
    if (departmentId) await ownDepartment(req.orgId, departmentId);
    sendOk(res, (await employees.list(req.orgId, { departmentId })).map(withMagicLink));
  });
  employeeRouter.get('/:id', async (req, res) => sendOk(res, withMagicLink(found(await employees.get(req.orgId, req.params.id)))));
  employeeRouter.post('/', requireRole(...WRITE_ROLES), async (req, res) => {
    const data = employeeSchema.parse(req.body ?? {});
    await ownDepartment(req.orgId, data.departmentId);
    const sundayGroup = data.sundayGroup ?? ((await employees.count(req.orgId, { departmentId: data.departmentId })) % 3) + 1;
    const employee = await employees.create(req.orgId, {
      ...data,
      sundayGroup,
      accessToken: randomBytes(32).toString('base64url'),
    });
    sendOk(res, withMagicLink(employee), 201);
  });
  const updateEmployee = async (req, res) => {
    const patch = onlyProvided(employeeUpdateSchema.parse(req.body ?? {}), req.body);
    if (patch.departmentId) await ownDepartment(req.orgId, patch.departmentId);
    sendOk(res, withMagicLink(found(await employees.update(req.orgId, req.params.id, patch))));
  };
  employeeRouter.put('/:id', requireRole(...WRITE_ROLES), updateEmployee);
  employeeRouter.patch('/:id', requireRole(...WRITE_ROLES), updateEmployee);
  employeeRouter.delete('/:id', requireRole(...WRITE_ROLES), async (req, res) => {
    found((await employees.remove(req.orgId, req.params.id)) || null);
    sendOk(res, { id: req.params.id, deleted: true });
  });

  // ---- Turnos ----
  const shiftRouter = Router();
  shiftRouter.get('/', async (req, res) => {
    const departmentId = asString(req.query.departmentId);
    if (departmentId) await ownDepartment(req.orgId, departmentId);
    sendOk(res, await shifts.list(req.orgId, { departmentId }));
  });
  shiftRouter.get('/:id', async (req, res) => sendOk(res, found(await shifts.get(req.orgId, req.params.id))));
  shiftRouter.post('/', requireRole(...WRITE_ROLES), async (req, res) => {
    const data = shiftSchema.parse(req.body ?? {});
    await ownDepartment(req.orgId, data.departmentId);
    sendOk(res, await shifts.create(req.orgId, data), 201);
  });
  const updateShift = async (req, res) => {
    const patch = onlyProvided(shiftUpdateSchema.parse(req.body ?? {}), req.body);
    if (patch.departmentId) await ownDepartment(req.orgId, patch.departmentId);
    sendOk(res, found(await shifts.update(req.orgId, req.params.id, patch)));
  };
  shiftRouter.put('/:id', requireRole(...WRITE_ROLES), updateShift);
  shiftRouter.patch('/:id', requireRole(...WRITE_ROLES), updateShift);
  shiftRouter.delete('/:id', requireRole(...WRITE_ROLES), async (req, res) => {
    found((await shifts.remove(req.orgId, req.params.id)) || null);
    sendOk(res, { id: req.params.id, deleted: true });
  });

  // ---- Ausências ----
  const absenceRouter = Router();
  absenceRouter.get('/', async (req, res) => {
    const employeeId = asString(req.query.employeeId);
    const departmentId = asString(req.query.departmentId);
    if (employeeId) found(await employees.get(req.orgId, employeeId));
    let filter = { employeeId };
    if (!employeeId && departmentId) {
      await ownDepartment(req.orgId, departmentId);
      const team = await employees.list(req.orgId, { departmentId });
      filter = { employeeId: { in: team.map((e) => e.id) } };
    }
    sendOk(res, await absences.list(req.orgId, filter));
  });
  absenceRouter.get('/:id', async (req, res) => sendOk(res, found(await absences.get(req.orgId, req.params.id))));
  absenceRouter.post('/', requireRole(...WRITE_ROLES), async (req, res) => {
    const data = absenceSchema.parse(req.body ?? {});
    found(await employees.get(req.orgId, data.employeeId));
    sendOk(res, await absences.create(req.orgId, data), 201);
  });
  const updateAbsence = async (req, res) => {
    const patch = absenceUpdateSchema.parse(req.body ?? {});
    if (patch.employeeId) found(await employees.get(req.orgId, patch.employeeId));
    sendOk(res, found(await absences.update(req.orgId, req.params.id, patch)));
  };
  absenceRouter.put('/:id', requireRole(...WRITE_ROLES), updateAbsence);
  absenceRouter.patch('/:id', requireRole(...WRITE_ROLES), updateAbsence);
  absenceRouter.delete('/:id', requireRole(...WRITE_ROLES), async (req, res) => {
    found((await absences.remove(req.orgId, req.params.id)) || null);
    sendOk(res, { id: req.params.id, deleted: true });
  });

  return { departments: departmentRouter, employees: employeeRouter, shifts: shiftRouter, absences: absenceRouter };
}
