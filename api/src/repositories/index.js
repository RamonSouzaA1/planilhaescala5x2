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
 * @property {{
 *   get: (id: string) => Promise<any | null>,
 *   update: (id: string, patch: any) => Promise<any | null>,
 *   findByReferralCode: (code: string) => Promise<any | null>,
 *   remove: (id: string) => Promise<boolean>,
 *   exportData: (id: string) => Promise<Record<string, any> | null>,
 * }} organizations - remove apaga a organização e tudo em cascata; exportData devolve tudo (sem filtrar segredos)
 * @property {{
 *   findByEmail: (email: string) => Promise<any | null>,
 *   get: (id: string) => Promise<any | null>,
 *   create: (orgId: string, data: { name: string, email: string, passwordHash: string, role: string, departmentIds?: string[] }) => Promise<any>,
 *   bumpTokenVersion: (id: string) => Promise<any | null>,
 *   changePassword: (id: string, passwordHash: string) => Promise<any | null>,
 * }} users - usuários trazem `departmentIds` (setores do SECTION_LEADER)
 * @property {Crud} departments
 * @property {Crud & { findByAccessToken: (token: string) => Promise<any | null> }} employees
 * @property {Crud} shifts
 * @property {Crud} absences
 * @property {Crud} coverageRules
 * @property {Pick<Crud, 'list' | 'get' | 'create' | 'count'> & {
 *   query: (orgId: string, q: { departmentIds?: string[], from?: string, to?: string, limit: number, offset: number }) => Promise<{ items: any[], total: number }>,
 *   purgeIps: (orgId: string, cutoffIso: string) => Promise<number>,
 * }} auditLogs - trilha imutável: sem update/remove; purgeIps só zera o IP de registros antigos
 * @property {{
 *   findCycle: (orgId: string, departmentId: string, weekStartDate: string) => Promise<any | null>,
 *   listWeek: (orgId: string, departmentId: string, weekStartDate: string) => Promise<any[]>,
 *   listForEmployee: (orgId: string, employeeId: string, dates: string[]) => Promise<any[]>,
 *   countByShift: (orgId: string, shiftId: string) => Promise<number>,
 *   saveWeek: (orgId: string, input: { departmentId: string, weekStartDate: string, cycleWeek: number, assignments: any[] }) => Promise<{ cycle: any, assignments: any[] }>, // volta o ciclo para DRAFT
 *   publishCycle: (orgId: string, cycleId: string, input: { publishedAt: string, publishedBy: string }) => Promise<any | null>,
 * }} schedules
 */

export { createMemoryRepositories } from './memory.js';
export { createPrismaRepositories } from './prisma.js';
