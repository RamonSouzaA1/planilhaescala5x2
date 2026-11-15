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
  return {
    accounts: {
      async register({ organization, user }) {
        try {
          const org = await prisma.organization.create({
            data: { ...toDb(organization), users: { create: { ...user, email: user.email.toLowerCase() } } },
            include: { users: true },
          });
          const { users, ...orgRow } = org;
          return { organization: fromDb(orgRow), user: fromDb(users[0]) };
        } catch (error) {
          if (error?.code === 'P2002' && String(error.meta?.target ?? '').includes('email')) {
            throw new AppError(409, 'EMAIL_IN_USE', 'Já existe uma conta com este e-mail.');
          }
          return rethrow(error);
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
    },
    users: {
      async findByEmail(email) {
        return fromDb(await prisma.userAccount.findUnique({ where: { email: email.toLowerCase() } }));
      },
      async get(id) {
        return fromDb(await prisma.userAccount.findUnique({ where: { id } }));
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
    auditLogs: crud(prisma.auditLog),
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
      async saveWeek(orgId, { departmentId, weekStartDate, cycleWeek, assignments }) {
        return prisma.$transaction(async (tx) => {
          const cycle = await tx.scheduleCycle.upsert({
            where: { departmentId_weekStartDate: { departmentId, weekStartDate } },
            create: { organizationId: orgId, departmentId, weekStartDate, cycleWeek },
            update: { cycleWeek },
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
