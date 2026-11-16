import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { canAddDepartment, canUseFeature } from '@escala/shared/utils/planPermissions.js';
import { todayInBrazil } from '../dates.js';
import { AppError, badRequest, found, sendOk } from '../errors.js';
import { assertDepartmentScope, MANAGER_ROLES, requireRole, WRITE_ROLES } from '../middleware/auth.js';
import {
  absenceDatesError,
  absenceSchema,
  absenceUpdateSchema,
  createDepartmentSchema,
  employeeSchema,
  employeeUpdateSchema,
  shiftBreakError,
  shiftSchema,
  shiftUpdateSchema,
} from '../schemas.js';

/** Mantém só as chaves enviadas no corpo (defaults do zod não podem sobrescrever o registro em PATCH). */
const onlyProvided = (patch, body = {}) => Object.fromEntries(Object.entries(patch).filter(([key]) => key in body));

const asString = (value) => (typeof value === 'string' && value ? value : undefined);

/** Token do Magic Link: 32 bytes aleatórios em base64url (43 caracteres). */
const newAccessToken = () => randomBytes(32).toString('base64url');

/**
 * Rotas de departamentos, funcionários, turnos e ausências. Todas assumem que
 * `requireAuth`, `tenantScope` e `effectivePlan` já rodaram: `req.orgId` vem do token e
 * `req.departmentScope` limita o SECTION_LEADER aos setores dele (fora do escopo → 404).
 * @param {{ repositories: import('../repositories/index.js').Repositories, config: import('../config.js').AppConfig }} deps
 * @returns {{ departments: Router, employees: Router, shifts: Router, absences: Router }}
 */
export function resourceRoutes({ repositories, config }) {
  const { departments, employees, shifts, absences, schedules, auditLogs } = repositories;

  /** Setor da organização do token e do escopo do usuário, ou 404. */
  const scopedDepartment = async (req, id) => {
    assertDepartmentScope(req, id);
    return found(await departments.get(req.orgId, id));
  };
  /** Registro com `departmentId` (funcionário, turno) da organização e do escopo, ou 404. */
  const scopedRecord = async (repo, req, id) => {
    const record = found(await repo.get(req.orgId, id));
    assertDepartmentScope(req, record.departmentId);
    return record;
  };
  const scopedEmployee = (req, id) => scopedRecord(employees, req, id);
  const scopedShift = (req, id) => scopedRecord(shifts, req, id);
  const scopedAbsence = async (req, id) => {
    const absence = found(await absences.get(req.orgId, id));
    await scopedEmployee(req, absence.employeeId);
    return absence;
  };
  /** Filtro de listagem por setor: o informado na query (conferido) ou todos os do escopo. */
  const departmentFilter = async (req) => {
    const departmentId = asString(req.query.departmentId);
    if (departmentId) {
      await scopedDepartment(req, departmentId);
      return { departmentId };
    }
    return req.departmentScope ? { departmentId: { in: [...req.departmentScope] } } : {};
  };
  const audit = (req, departmentId, action, details) =>
    auditLogs.create(req.orgId, { departmentId, userId: req.user.id, action, details, ip: req.ip, timestamp: new Date().toISOString() });

  // ---- Departamentos ----
  const departmentRouter = Router();
  const departmentSchemaForToday = () => createDepartmentSchema(todayInBrazil(config.now()));
  departmentRouter.get('/', async (req, res) => {
    const filter = req.departmentScope ? { id: { in: [...req.departmentScope] } } : {};
    sendOk(res, await departments.list(req.orgId, filter));
  });
  departmentRouter.get('/:id', async (req, res) => sendOk(res, await scopedDepartment(req, req.params.id)));
  departmentRouter.post('/', requireRole(...MANAGER_ROLES), async (req, res) => {
    const data = departmentSchemaForToday().parse(req.body ?? {});
    if (!canAddDepartment(req.plan, await departments.count(req.orgId))) {
      throw new AppError(403, 'PLAN_LIMIT_DEPARTMENTS', 'O plano atual não permite mais setores. Faça upgrade para adicionar outro.');
    }
    sendOk(res, await departments.create(req.orgId, data), 201);
  });
  const updateDepartment = async (req, res) => {
    const patch = onlyProvided(departmentSchemaForToday().partial().parse(req.body ?? {}), req.body);
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
  /**
   * O Magic Link só aparece para quem escreve e quando o plano efetivo tem o portal;
   * nos demais casos o accessToken é omitido (LGPD).
   */
  const presentEmployee = (req) => {
    const showLink = WRITE_ROLES.includes(req.user.role) && canUseFeature(req.plan, 'allowEmployeePortal');
    return (employee) => {
      const { accessToken, ...rest } = employee;
      return showLink ? { ...employee, magicLinkUrl: `${config.publicAppUrl}/minha-escala/${accessToken}` } : rest;
    };
  };
  /** Confere que os turnos citados nas restrições existem na organização. */
  const assertShiftRefs = async (req, fixedConstraints) => {
    const ids = [...new Set(fixedConstraints?.unavailableShiftIds ?? [])];
    if (!ids.length) return;
    const known = new Set((await shifts.list(req.orgId, { id: { in: ids } })).map((s) => s.id));
    const missing = ids.filter((id) => !known.has(id));
    if (missing.length) {
      const message = `Turno inexistente nas restrições: ${missing.join(', ')}.`;
      throw badRequest(message, [{ path: 'fixedConstraints.unavailableShiftIds', message }]);
    }
  };
  employeeRouter.get('/', async (req, res) => {
    const list = await employees.list(req.orgId, await departmentFilter(req));
    sendOk(res, list.map(presentEmployee(req)));
  });
  employeeRouter.get('/:id', async (req, res) => sendOk(res, presentEmployee(req)(await scopedEmployee(req, req.params.id))));
  employeeRouter.post('/', requireRole(...WRITE_ROLES), async (req, res) => {
    const data = employeeSchema.parse(req.body ?? {});
    await scopedDepartment(req, data.departmentId);
    await assertShiftRefs(req, data.fixedConstraints);
    const sundayGroup = data.sundayGroup ?? ((await employees.count(req.orgId, { departmentId: data.departmentId })) % 3) + 1;
    const employee = await employees.create(req.orgId, { ...data, sundayGroup, accessToken: newAccessToken() });
    sendOk(res, presentEmployee(req)(employee), 201);
  });
  const updateEmployee = async (req, res) => {
    const patch = onlyProvided(employeeUpdateSchema.parse(req.body ?? {}), req.body);
    await scopedEmployee(req, req.params.id);
    if (patch.departmentId) await scopedDepartment(req, patch.departmentId);
    await assertShiftRefs(req, patch.fixedConstraints);
    sendOk(res, presentEmployee(req)(found(await employees.update(req.orgId, req.params.id, patch))));
  };
  employeeRouter.put('/:id', requireRole(...WRITE_ROLES), updateEmployee);
  employeeRouter.patch('/:id', requireRole(...WRITE_ROLES), updateEmployee);
  employeeRouter.delete('/:id', requireRole(...WRITE_ROLES), async (req, res) => {
    await scopedEmployee(req, req.params.id);
    found((await employees.remove(req.orgId, req.params.id)) || null);
    sendOk(res, { id: req.params.id, deleted: true });
  });
  // Revoga o Magic Link: o token antigo deixa de funcionar na hora.
  employeeRouter.post('/:id/rotate-token', requireRole(...WRITE_ROLES), async (req, res) => {
    const employee = await scopedEmployee(req, req.params.id);
    const updated = found(await employees.update(req.orgId, employee.id, { accessToken: newAccessToken() }));
    await audit(req, employee.departmentId, 'ROTACIONOU_LINK', `Magic Link de ${employee.name} revogado e gerado de novo.`);
    sendOk(res, presentEmployee(req)(updated));
  });

  // ---- Turnos ----
  const shiftRouter = Router();
  shiftRouter.get('/', async (req, res) => sendOk(res, await shifts.list(req.orgId, await departmentFilter(req))));
  shiftRouter.get('/:id', async (req, res) => sendOk(res, await scopedShift(req, req.params.id)));
  shiftRouter.post('/', requireRole(...WRITE_ROLES), async (req, res) => {
    const data = shiftSchema.parse(req.body ?? {});
    await scopedDepartment(req, data.departmentId);
    sendOk(res, await shifts.create(req.orgId, data), 201);
  });
  const updateShift = async (req, res) => {
    const patch = onlyProvided(shiftUpdateSchema.parse(req.body ?? {}), req.body);
    const current = await scopedShift(req, req.params.id);
    const breakError = shiftBreakError({ ...current, ...patch });
    if (breakError) throw badRequest(breakError, [{ path: ['breakDurationMinutes'], message: breakError }]);
    if (patch.departmentId) await scopedDepartment(req, patch.departmentId);
    sendOk(res, found(await shifts.update(req.orgId, req.params.id, patch)));
  };
  shiftRouter.put('/:id', requireRole(...WRITE_ROLES), updateShift);
  shiftRouter.patch('/:id', requireRole(...WRITE_ROLES), updateShift);
  // Turno usado em alguma célula não pode sumir: a célula ficaria sem turno e a validação, verde.
  shiftRouter.delete('/:id', requireRole(...WRITE_ROLES), async (req, res) => {
    await scopedShift(req, req.params.id);
    const assignmentCount = await schedules.countByShift(req.orgId, req.params.id);
    if (assignmentCount > 0) {
      throw new AppError(
        409,
        'SHIFT_IN_USE',
        `O turno está em uso em ${assignmentCount} célula(s) da escala. Troque essas células antes de excluir.`,
        { assignmentCount },
      );
    }
    found((await shifts.remove(req.orgId, req.params.id)) || null);
    sendOk(res, { id: req.params.id, deleted: true });
  });

  // ---- Ausências ----
  const absenceRouter = Router();
  absenceRouter.get('/', async (req, res) => {
    const employeeId = asString(req.query.employeeId);
    if (employeeId) {
      await scopedEmployee(req, employeeId);
      return sendOk(res, await absences.list(req.orgId, { employeeId }));
    }
    const scopeFilter = await departmentFilter(req);
    if (!scopeFilter.departmentId) return sendOk(res, await absences.list(req.orgId));
    const team = await employees.list(req.orgId, scopeFilter);
    sendOk(res, await absences.list(req.orgId, { employeeId: { in: team.map((e) => e.id) } }));
  });
  absenceRouter.get('/:id', async (req, res) => sendOk(res, await scopedAbsence(req, req.params.id)));
  absenceRouter.post('/', requireRole(...WRITE_ROLES), async (req, res) => {
    const data = absenceSchema.parse(req.body ?? {});
    await scopedEmployee(req, data.employeeId);
    sendOk(res, await absences.create(req.orgId, data), 201);
  });
  const updateAbsence = async (req, res) => {
    const patch = onlyProvided(absenceUpdateSchema.parse(req.body ?? {}), req.body);
    const current = await scopedAbsence(req, req.params.id);
    if (patch.employeeId) await scopedEmployee(req, patch.employeeId);
    const datesError = absenceDatesError({ ...current, ...patch });
    if (datesError) throw badRequest(datesError, [{ path: 'endDate', message: datesError }]);
    sendOk(res, found(await absences.update(req.orgId, req.params.id, patch)));
  };
  absenceRouter.put('/:id', requireRole(...WRITE_ROLES), updateAbsence);
  absenceRouter.patch('/:id', requireRole(...WRITE_ROLES), updateAbsence);
  absenceRouter.delete('/:id', requireRole(...WRITE_ROLES), async (req, res) => {
    await scopedAbsence(req, req.params.id);
    found((await absences.remove(req.orgId, req.params.id)) || null);
    sendOk(res, { id: req.params.id, deleted: true });
  });

  return { departments: departmentRouter, employees: employeeRouter, shifts: shiftRouter, absences: absenceRouter };
}
