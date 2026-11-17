import { randomUUID } from 'node:crypto';
import { AppError } from '../errors.js';

/**
 * Implementação em memória dos repositórios (testes e desenvolvimento local, sem banco).
 * Mesmo contrato da implementação Prisma (`prisma.js`): toda leitura/escrita de recurso
 * recebe o `organizationId` e só enxerga registros dessa organização.
 */

const clone = (value) => (value === undefined ? undefined : structuredClone(value));

/** @param {any} row @param {Record<string, any>} filter */
function matches(row, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    if (expected === undefined) return true;
    if (expected && typeof expected === 'object' && Array.isArray(expected.in)) return expected.in.includes(row[key]);
    return row[key] === expected;
  });
}

/**
 * Coleção genérica com escopo de organização.
 * @param {(orgId: string, id: string) => void} [onRemove] - cascata ao remover
 */
function createCollection(onRemove) {
  /** @type {Map<string, any>} */
  const rows = new Map();
  return {
    rows,
    async list(orgId, filter = {}) {
      return [...rows.values()].filter((r) => r.organizationId === orgId && matches(r, filter)).map(clone);
    },
    async get(orgId, id) {
      const row = rows.get(id);
      return row && row.organizationId === orgId ? clone(row) : null;
    },
    async create(orgId, data) {
      const row = { createdAt: new Date().toISOString(), ...clone(data), id: randomUUID(), organizationId: orgId };
      rows.set(row.id, row);
      return clone(row);
    },
    async update(orgId, id, patch) {
      const row = rows.get(id);
      if (!row || row.organizationId !== orgId) return null;
      const { id: _id, organizationId: _org, ...safe } = clone(patch);
      Object.assign(row, safe);
      return clone(row);
    },
    async remove(orgId, id) {
      const row = rows.get(id);
      if (!row || row.organizationId !== orgId) return false;
      rows.delete(id);
      onRemove?.(orgId, id);
      return true;
    },
    async count(orgId, filter = {}) {
      return [...rows.values()].filter((r) => r.organizationId === orgId && matches(r, filter)).length;
    },
    removeWhere(predicate) {
      for (const [id, row] of rows) if (predicate(row)) rows.delete(id);
    },
  };
}

/**
 * Trilha de auditoria: só criar, ler e anonimizar IP vencido. Sem update/remove, de propósito
 * (a trilha é imutável); a organização inteira só some pela exclusão em cascata da conta.
 */
function createAuditLogs(store) {
  const { list, get, create, count } = store;
  return {
    list,
    get,
    create,
    count,
    /** Página dos registros mais recentes primeiro, com total. */
    async query(orgId, { departmentIds, from, to, limit, offset }) {
      const inScope = (r) => !departmentIds || (r.departmentId && departmentIds.includes(r.departmentId));
      const rows = [...store.rows.values()]
        .filter((r) => r.organizationId === orgId && inScope(r))
        .filter((r) => (!from || r.timestamp >= from) && (!to || r.timestamp < to))
        .reverse() // empate de timestamp: o mais recente inserido primeiro
        .sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
      return { items: rows.slice(offset, offset + limit).map(clone), total: rows.length };
    },
    /** Remove o IP dos registros da organização anteriores a `cutoff` (ISO); devolve quantos mudaram. */
    async purgeIps(orgId, cutoff) {
      let changed = 0;
      for (const row of store.rows.values()) {
        if (row.organizationId === orgId && row.ip && row.timestamp < cutoff) {
          row.ip = null;
          changed += 1;
        }
      }
      return changed;
    },
  };
}

/**
 * Cria o conjunto de repositórios em memória.
 * @returns {import('./index.js').Repositories}
 */
export function createMemoryRepositories() {
  const departments = createCollection((orgId, deptId) => {
    for (const employee of employees.rows.values()) {
      if (employee.departmentId === deptId) employees.remove(orgId, employee.id);
    }
    shifts.removeWhere((r) => r.departmentId === deptId);
    coverageRules.removeWhere((r) => r.departmentId === deptId);
    for (const cycle of cycles.rows.values()) {
      if (cycle.departmentId === deptId) {
        assignments.removeWhere((a) => a.scheduleCycleId === cycle.id);
        cycles.rows.delete(cycle.id);
      }
    }
  });
  const employees = createCollection((_orgId, employeeId) => {
    absences.removeWhere((a) => a.employeeId === employeeId);
    assignments.removeWhere((a) => a.employeeId === employeeId);
  });
  const shifts = createCollection((_orgId, shiftId) => {
    for (const a of assignments.rows.values()) if (a.shiftId === shiftId) a.shiftId = undefined;
  });
  const absences = createCollection();
  const coverageRules = createCollection();
  const cycles = createCollection();
  const assignments = createCollection();
  const auditLogsStore = createCollection();
  const stores = createCollection();
  const swapRequests = createCollection();
  const paymentTransactions = createCollection();

  /** @type {Map<string, any>} */
  const organizations = new Map();
  /** @type {Map<string, any>} */
  const users = new Map();

  return {
    accounts: {
      async register({ organization, user }) {
        const email = user.email.toLowerCase();
        if ([...users.values()].some((u) => u.email === email)) {
          throw new AppError(409, 'EMAIL_IN_USE', 'Já existe uma conta com este e-mail.');
        }
        const org = { createdAt: new Date().toISOString(), ...clone(organization), id: randomUUID() };
        const account = { createdAt: new Date().toISOString(), departmentIds: [], tokenVersion: 0, ...clone(user), email, id: randomUUID(), organizationId: org.id };
        organizations.set(org.id, org);
        users.set(account.id, account);
        return { organization: clone(org), user: clone(account) };
      },
    },
    organizations: {
      async get(id) {
        return clone(organizations.get(id) ?? null);
      },
      async update(id, patch) {
        const org = organizations.get(id);
        if (!org) return null;
        const { id: _id, ...safe } = clone(patch);
        Object.assign(org, safe);
        return clone(org);
      },
      async findByReferralCode(code) {
        return clone([...organizations.values()].find((o) => o.referralCode === code) ?? null);
      },
      /** Apaga a organização e tudo que depende dela (equivalente ao onDelete: Cascade do schema). */
      async remove(id) {
        if (!organizations.has(id)) return false;
        for (const collection of [auditLogsStore, assignments, cycles, absences, coverageRules, shifts, employees, swapRequests, stores, paymentTransactions, departments]) {
          collection.removeWhere((row) => row.organizationId === id);
        }
        for (const [userId, user] of users) if (user.organizationId === id) users.delete(userId);
        organizations.delete(id);
        return true;
      },
      /** Todos os dados da organização, sem filtrar segredos (a rota de exportação os remove). */
      async exportData(id) {
        const organization = organizations.get(id);
        if (!organization) return null;
        const all = async (collection) => collection.list(id);
        return {
          organization: clone(organization),
          users: [...users.values()].filter((u) => u.organizationId === id).map(clone),
          stores: await all(stores),
          departments: await all(departments),
          employees: await all(employees),
          shifts: await all(shifts),
          coverageRules: await all(coverageRules),
          absences: await all(absences),
          scheduleCycles: await all(cycles),
          dailyAssignments: await all(assignments),
          swapRequests: await all(swapRequests),
          paymentTransactions: await all(paymentTransactions),
          auditLogs: await all(auditLogsStore),
        };
      },
    },
    users: {
      async findByEmail(email) {
        const normalized = email.toLowerCase();
        return clone([...users.values()].find((u) => u.email === normalized) ?? null);
      },
      async get(id) {
        return clone(users.get(id) ?? null);
      },
      /** Cria um usuário na organização (cadastro pelo OWNER). E-mail repetido → 409. */
      async create(orgId, data) {
        const email = data.email.toLowerCase();
        if ([...users.values()].some((u) => u.email === email)) {
          throw new AppError(409, 'EMAIL_IN_USE', 'Já existe uma conta com este e-mail.');
        }
        const account = { createdAt: new Date().toISOString(), departmentIds: [], tokenVersion: 0, ...clone(data), email, id: randomUUID(), organizationId: orgId };
        users.set(account.id, account);
        return clone(account);
      },
      /** Revoga todos os tokens do usuário (incrementa tokenVersion). */
      async bumpTokenVersion(id) {
        const user = users.get(id);
        if (!user) return null;
        user.tokenVersion = (user.tokenVersion ?? 0) + 1;
        return clone(user);
      },
      /** Troca o hash da senha e revoga os tokens emitidos antes (incrementa tokenVersion). */
      async changePassword(id, passwordHash) {
        const user = users.get(id);
        if (!user) return null;
        user.passwordHash = passwordHash;
        user.tokenVersion = (user.tokenVersion ?? 0) + 1;
        return clone(user);
      },
    },
    departments,
    employees: {
      ...employees,
      /** Busca entre organizações: usada só pela rota pública do Magic Link. */
      async findByAccessToken(token) {
        return clone([...employees.rows.values()].find((e) => e.accessToken === token) ?? null);
      },
    },
    shifts,
    absences,
    coverageRules,
    auditLogs: createAuditLogs(auditLogsStore),
    schedules: {
      async findCycle(orgId, departmentId, weekStartDate) {
        const cycle = [...cycles.rows.values()].find(
          (c) => c.organizationId === orgId && c.departmentId === departmentId && c.weekStartDate === weekStartDate,
        );
        return clone(cycle ?? null);
      },
      async listWeek(orgId, departmentId, weekStartDate) {
        const cycle = [...cycles.rows.values()].find(
          (c) => c.organizationId === orgId && c.departmentId === departmentId && c.weekStartDate === weekStartDate,
        );
        if (!cycle) return [];
        return assignments.list(orgId, { scheduleCycleId: cycle.id });
      },
      async listForEmployee(orgId, employeeId, dates) {
        return assignments.list(orgId, { employeeId, date: { in: dates } });
      },
      async countByShift(orgId, shiftId) {
        return assignments.count(orgId, { shiftId });
      },
      async saveWeek(orgId, { departmentId, weekStartDate, cycleWeek, assignments: items }) {
        let cycle = [...cycles.rows.values()].find(
          (c) => c.organizationId === orgId && c.departmentId === departmentId && c.weekStartDate === weekStartDate,
        );
        if (cycle) Object.assign(cycle, { cycleWeek, status: 'DRAFT', publishedAt: null, publishedBy: null });
        else cycle = await cycles.create(orgId, { departmentId, weekStartDate, cycleWeek, status: 'DRAFT' }).then((c) => cycles.rows.get(c.id));
        assignments.removeWhere((a) => a.scheduleCycleId === cycle.id);
        const saved = [];
        for (const item of items) {
          saved.push(await assignments.create(orgId, { ...item, scheduleCycleId: cycle.id }));
        }
        return { cycle: clone(cycle), assignments: saved };
      },
      /** Marca o ciclo como publicado. */
      async publishCycle(orgId, cycleId, { publishedAt, publishedBy }) {
        return cycles.update(orgId, cycleId, { status: 'PUBLISHED', publishedAt, publishedBy });
      },
    },
  };
}
