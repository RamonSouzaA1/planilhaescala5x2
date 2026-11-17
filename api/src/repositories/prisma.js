import { AppError } from '../errors.js';

/**
 * Implementação Prisma (PostgreSQL) dos repositórios. Mesmo contrato de `memory.js`.
 * Todo recurso tem `organizationId`; toda consulta filtra por ele (isolamento multi-tenant).
 */

const SUNDAY_TO_DB = { '1_IN_3': 'ONE_IN_3', '1_IN_2': 'ONE_IN_2', CUSTOM: 'CUSTOM' };
const SUNDAY_FROM_DB = { ONE_IN_3: '1_IN_3', ONE_IN_2: '1_IN_2', CUSTOM: 'CUSTOM' };
const DATE_FIELDS = ['planExpiresAt', 'paidAt', 'publishedAt', 'timestamp'];

/** Converte Date → ISO e enums de domingo para o formato do domínio. */
function fromDb(row) {
  if (!row) return null;
  const out = { ...row };
  for (const [key, value] of Object.entries(out)) {
    if (value instanceof Date) out[key] = value.toISOString();
  }
  if (out.defaultSundayRule) out.defaultSundayRule = SUNDAY_FROM_DB[out.defaultSundayRule] ?? out.defaultSundayRule;
  if (out.customSundayRule) out.customSundayRule = SUNDAY_FROM_DB[out.customSundayRule] ?? out.customSundayRule;
  else if ('customSundayRule' in out) out.customSundayRule = undefined;
  if ('shiftId' in out && out.shiftId === null) out.shiftId = undefined;
  return out;
}

/** Enums de domingo e datas ISO para o formato do banco. */
function toDb(data) {
  const out = { ...data };
  if (out.defaultSundayRule) out.defaultSundayRule = SUNDAY_TO_DB[out.defaultSundayRule];
  if (out.customSundayRule) out.customSundayRule = SUNDAY_TO_DB[out.customSundayRule];
  if (out.customSundayRule === undefined) delete out.customSundayRule;
  for (const key of DATE_FIELDS) if (typeof out[key] === 'string') out[key] = new Date(out[key]);
  if ('fixedConstraints' in out && !out.fixedConstraints) out.fixedConstraints = {};
  return out;
}

/** Inclui só os ids dos setores do usuário (relação implícita "UserDepartments"). */
const USER_INCLUDE = { departments: { select: { id: true } } };

/** Usuário do banco → domínio: `departments` vira `departmentIds`. */
function userFromDb(row) {
  if (!row) return null;
  const { departments, ...rest } = row;
  return { ...fromDb(rest), departmentIds: (departments ?? []).map((d) => d.id) };
}

/** P2002 no e-mail do usuário vira EMAIL_IN_USE; demais erros seguem `rethrow`. */
function rethrowUser(error) {
  if (error?.code === 'P2002' && String(error.meta?.target ?? '').includes('email')) {
    throw new AppError(409, 'EMAIL_IN_USE', 'Já existe uma conta com este e-mail.');
  }
  return rethrow(error);
}

/** Traduz violação de unicidade do Prisma (P2002) em erro de aplicação. */
function rethrow(error) {
  if (error?.code === 'P2002') throw new AppError(409, 'CONFLICT', 'Registro duplicado.');
  throw error;
}

/** CRUD genérico com escopo de organização sobre um delegate do Prisma. */
function crud(delegate) {
  const where = (orgId, filter = {}) => ({ ...filter, organizationId: orgId });
  const api = {
    async list(orgId, filter) {
      return (await delegate.findMany({ where: where(orgId, filter) })).map(fromDb);
    },
    async get(orgId, id) {
      return fromDb(await delegate.findFirst({ where: { id, organizationId: orgId } }));
    },
    async create(orgId, data) {
      try {
        return fromDb(await delegate.create({ data: { ...toDb(data), organizationId: orgId } }));
      } catch (error) {
        return rethrow(error);
      }
    },
    async update(orgId, id, patch) {
      const { id: _id, organizationId: _org, ...safe } = patch;
      const result = await delegate.updateMany({ where: { id, organizationId: orgId }, data: toDb(safe) });
      return result.count === 0 ? null : api.get(orgId, id);
    },
    async remove(orgId, id) {
      const result = await delegate.deleteMany({ where: { id, organizationId: orgId } });
      return result.count > 0;
    },
    async count(orgId, filter) {
      return delegate.count({ where: where(orgId, filter) });
    },
  };
  return api;
}

/**
 * @param {any} prisma - instância de PrismaClient
 * @returns {import('./index.js').Repositories}
 */
export function createPrismaRepositories(prisma) {
  /** Atualiza um usuário e devolve o registro de domínio (null se não existir). */
  const updateUser = async (id, data) => {
    try {
      return userFromDb(await prisma.userAccount.update({ where: { id }, data, include: USER_INCLUDE }));
    } catch (error) {
      if (error?.code === 'P2025') return null;
      throw error;
    }
  };
  const auditCrud = crud(prisma.auditLog);

  return {
    accounts: {
      async register({ organization, user }) {
        try {
          const org = await prisma.organization.create({
            data: { ...toDb(organization), users: { create: { ...user, email: user.email.toLowerCase() } } },
            include: { users: { include: USER_INCLUDE } },
          });
          const { users, ...orgRow } = org;
          return { organization: fromDb(orgRow), user: userFromDb(users[0]) };
        } catch (error) {
          return rethrowUser(error);
        }
      },
    },
    organizations: {
      async get(id) {
        return fromDb(await prisma.organization.findUnique({ where: { id } }));
      },
      async update(id, patch) {
        try {
          return fromDb(await prisma.organization.update({ where: { id }, data: toDb(patch) }));
        } catch (error) {
          if (error?.code === 'P2025') return null;
          throw error;
        }
      },
      async findByReferralCode(code) {
        return fromDb(await prisma.organization.findUnique({ where: { referralCode: code } }));
      },
      /** Apaga a organização; o onDelete: Cascade do schema remove todo o resto. */
      async remove(id) {
        try {
          await prisma.organization.delete({ where: { id } });
          return true;
        } catch (error) {
          if (error?.code === 'P2025') return false;
          throw error;
        }
      },
      /** Todos os dados da organização, sem filtrar segredos (a rota de exportação os remove). */
      async exportData(id) {
        const organization = await prisma.organization.findUnique({ where: { id } });
        if (!organization) return null;
        const where = { organizationId: id };
        const [users, stores, departments, employees, shifts, coverageRules, absences, scheduleCycles, dailyAssignments, swapRequests, paymentTransactions, auditLogs] =
          await Promise.all([
            prisma.userAccount.findMany({ where, include: USER_INCLUDE }),
            prisma.store.findMany({ where }),
            prisma.department.findMany({ where }),
            prisma.employee.findMany({ where }),
            prisma.shiftTemplate.findMany({ where }),
            prisma.coverageRule.findMany({ where }),
            prisma.absence.findMany({ where }),
            prisma.scheduleCycle.findMany({ where }),
            prisma.dailyAssignment.findMany({ where }),
            prisma.shiftSwapRequest.findMany({ where }),
            prisma.paymentTransaction.findMany({ where }),
            prisma.auditLog.findMany({ where, orderBy: { timestamp: 'asc' } }),
          ]);
        return {
          organization: fromDb(organization),
          users: users.map(userFromDb),
          stores: stores.map(fromDb),
          departments: departments.map(fromDb),
          employees: employees.map(fromDb),
          shifts: shifts.map(fromDb),
          coverageRules: coverageRules.map(fromDb),
          absences: absences.map(fromDb),
          scheduleCycles: scheduleCycles.map(fromDb),
          dailyAssignments: dailyAssignments.map(fromDb),
          swapRequests: swapRequests.map(fromDb),
          paymentTransactions: paymentTransactions.map(fromDb),
          auditLogs: auditLogs.map(fromDb),
        };
      },
    },
    users: {
      async findByEmail(email) {
        return userFromDb(await prisma.userAccount.findUnique({ where: { email: email.toLowerCase() }, include: USER_INCLUDE }));
      },
      async get(id) {
        return userFromDb(await prisma.userAccount.findUnique({ where: { id }, include: USER_INCLUDE }));
      },
      /** Cria um usuário na organização, ligando os setores (que a rota já conferiu na organização). */
      async create(orgId, { departmentIds = [], ...data }) {
        try {
          const row = await prisma.userAccount.create({
            data: {
              ...data,
              email: data.email.toLowerCase(),
              organizationId: orgId,
              departments: { connect: departmentIds.map((id) => ({ id })) },
            },
            include: USER_INCLUDE,
          });
          return userFromDb(row);
        } catch (error) {
          return rethrowUser(error);
        }
      },
      /** Revoga todos os tokens do usuário (incrementa tokenVersion). */
      async bumpTokenVersion(id) {
        return updateUser(id, { tokenVersion: { increment: 1 } });
      },
      /** Troca o hash da senha e revoga os tokens emitidos antes (incrementa tokenVersion). */
      async changePassword(id, passwordHash) {
        return updateUser(id, { passwordHash, tokenVersion: { increment: 1 } });
      },
    },
    departments: crud(prisma.department),
    employees: {
      ...crud(prisma.employee),
      /** Busca entre organizações: usada só pela rota pública do Magic Link. */
      async findByAccessToken(token) {
        return fromDb(await prisma.employee.findUnique({ where: { accessToken: token } }));
      },
    },
    shifts: crud(prisma.shiftTemplate),
    absences: crud(prisma.absence),
    coverageRules: crud(prisma.coverageRule),
    // Trilha imutável: só criar, ler e anonimizar IP vencido (sem update/remove).
    auditLogs: {
      list: auditCrud.list,
      get: auditCrud.get,
      create: auditCrud.create,
      count: auditCrud.count,
      /** Página dos registros mais recentes primeiro, com total. */
      async query(orgId, { departmentIds, from, to, limit, offset }) {
        const where = { organizationId: orgId };
        if (departmentIds) where.departmentId = { in: departmentIds };
        if (from || to) where.timestamp = { ...(from && { gte: new Date(from) }), ...(to && { lt: new Date(to) }) };
        const [rows, total] = await Promise.all([
          prisma.auditLog.findMany({ where, orderBy: [{ timestamp: 'desc' }, { id: 'desc' }], skip: offset, take: limit }),
          prisma.auditLog.count({ where }),
        ]);
        return { items: rows.map(fromDb), total };
      },
      /** Remove o IP dos registros da organização anteriores a cutoff (ISO); devolve quantos mudaram. */
      async purgeIps(orgId, cutoff) {
        const result = await prisma.auditLog.updateMany({
          where: { organizationId: orgId, ip: { not: null }, timestamp: { lt: new Date(cutoff) } },
          data: { ip: null },
        });
        return result.count;
      },
    },
    schedules: {
      async findCycle(orgId, departmentId, weekStartDate) {
        return fromDb(await prisma.scheduleCycle.findFirst({ where: { organizationId: orgId, departmentId, weekStartDate } }));
      },
      async listWeek(orgId, departmentId, weekStartDate) {
        const rows = await prisma.dailyAssignment.findMany({
          where: { organizationId: orgId, cycle: { departmentId, weekStartDate } },
        });
        return rows.map(fromDb);
      },
      async listForEmployee(orgId, employeeId, dates) {
        const rows = await prisma.dailyAssignment.findMany({
          where: { organizationId: orgId, employeeId, date: { in: dates } },
        });
        return rows.map(fromDb);
      },
      async countByShift(orgId, shiftId) {
        return prisma.dailyAssignment.count({ where: { organizationId: orgId, shiftId } });
      },
      /** Marca o ciclo como publicado. */
      async publishCycle(orgId, cycleId, { publishedAt, publishedBy }) {
        const result = await prisma.scheduleCycle.updateMany({
          where: { id: cycleId, organizationId: orgId },
          data: { status: 'PUBLISHED', publishedAt: new Date(publishedAt), publishedBy },
        });
        if (result.count === 0) return null;
        return fromDb(await prisma.scheduleCycle.findFirst({ where: { id: cycleId, organizationId: orgId } }));
      },
      async saveWeek(orgId, { departmentId, weekStartDate, cycleWeek, assignments }) {
        return prisma.$transaction(async (tx) => {
          const cycle = await tx.scheduleCycle.upsert({
            where: { departmentId_weekStartDate: { departmentId, weekStartDate } },
            create: { organizationId: orgId, departmentId, weekStartDate, cycleWeek },
            // Editar uma semana publicada a devolve para rascunho.
            update: { cycleWeek, status: 'DRAFT', publishedAt: null, publishedBy: null },
          });
          await tx.dailyAssignment.deleteMany({ where: { scheduleCycleId: cycle.id, organizationId: orgId } });
          await tx.dailyAssignment.createMany({
            data: assignments.map((a) => ({
              organizationId: orgId,
              scheduleCycleId: cycle.id,
              employeeId: a.employeeId,
              date: a.date,
              dayOfWeek: a.dayOfWeek,
              type: a.type,
              shiftId: a.shiftId ?? null,
              isPinned: Boolean(a.isPinned),
            })),
          });
          const saved = await tx.dailyAssignment.findMany({ where: { scheduleCycleId: cycle.id, organizationId: orgId } });
          return { cycle: fromDb(cycle), assignments: saved.map(fromDb) };
        });
      },
    },
  };
}
