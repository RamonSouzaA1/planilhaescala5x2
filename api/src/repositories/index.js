/**
 * Contrato dos repositórios (camada de persistência). Duas implementações:
 * `createPrismaRepositories` (produção) e `createMemoryRepositories` (testes / desenvolvimento).
 *
 * Os recursos com escopo de organização (departments, employees, shifts, absences,
 * coverageRules, auditLogs) expõem: list(orgId, filter), get(orgId, id), create(orgId, data),
 * update(orgId, id, patch) → registro | null, remove(orgId, id) → boolean, count(orgId, filter).
 * `filter` aceita igualdade (`{ departmentId }`) e `{ campo: { in: [...] } }`.
 *
 * @typedef {Object} Crud
 * @property {(orgId: string, filter?: Record<string, any>) => Promise<any[]>} list
 * @property {(orgId: string, id: string) => Promise<any | null>} get
 * @property {(orgId: string, data: Record<string, any>) => Promise<any>} create
 * @property {(orgId: string, id: string, patch: Record<string, any>) => Promise<any | null>} update
 * @property {(orgId: string, id: string) => Promise<boolean>} remove
 * @property {(orgId: string, filter?: Record<string, any>) => Promise<number>} count
 *
 * @typedef {Object} Repositories
 * @property {{ register: (input: { organization: any, user: any }) => Promise<{ organization: any, user: any }> }} accounts
 * @property {{ get: (id: string) => Promise<any | null>, update: (id: string, patch: any) => Promise<any | null>, findByReferralCode: (code: string) => Promise<any | null> }} organizations
 * @property {{ findByEmail: (email: string) => Promise<any | null>, get: (id: string) => Promise<any | null> }} users
 * @property {Crud} departments
 * @property {Crud & { findByAccessToken: (token: string) => Promise<any | null> }} employees
 * @property {Crud} shifts
 * @property {Crud} absences
 * @property {Crud} coverageRules
 * @property {Crud} auditLogs
 * @property {{
 *   findCycle: (orgId: string, departmentId: string, weekStartDate: string) => Promise<any | null>,
 *   listWeek: (orgId: string, departmentId: string, weekStartDate: string) => Promise<any[]>,
 *   listForEmployee: (orgId: string, employeeId: string, dates: string[]) => Promise<any[]>,
 *   saveWeek: (orgId: string, input: { departmentId: string, weekStartDate: string, cycleWeek: number, assignments: any[] }) => Promise<{ cycle: any, assignments: any[] }>,
 * }} schedules
 */

export { createMemoryRepositories } from './memory.js';
export { createPrismaRepositories } from './prisma.js';
