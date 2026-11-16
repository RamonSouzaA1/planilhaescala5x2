import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { createMemoryRepositories } from './repositories/memory.js';
import { createPrismaRepositories } from './repositories/prisma.js';

/**
 * Itens 1 e 2 do backlog (seção 9): escopo do líder de setor, cadastro de usuários pelo OWNER
 * e Magic Link (rotação, ocultação do token e plano sem portal).
 */

const SECRET = 'segredo-de-teste-com-mais-de-32-caracteres!!';
const WEEK = '2026-11-16';
const NOW = new Date('2026-11-18T15:00:00Z');
const PASSWORD = 'senha-forte-123';

let repositories;
let app;

beforeEach(() => {
  repositories = createMemoryRepositories();
  app = createApp({
    repositories,
    config: { jwtSecret: SECRET, now: () => NOW, rateLimit: { windowMs: 60_000, authMax: 1000, publicMax: 1000 } },
  });
});

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const get = (path, token) => request(app).get(path).set(auth(token));
const post = (path, token, body = {}) => request(app).post(path).set(auth(token)).send(body);
const patch = (path, token, body) => request(app).patch(path).set(auth(token)).send(body);
const put = (path, token, body) => request(app).put(path).set(auth(token)).send(body);
const del = (path, token) => request(app).delete(path).set(auth(token));

async function registerOwner(email = 'dono@example.com', plan = 'STORE_MULTI') {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Dona Ana', email, password: PASSWORD, organizationName: `Org ${email}` });
  expect(res.status).toBe(201);
  const { token, user, organization } = res.body.data;
  if (plan !== 'FREE') await repositories.organizations.update(organization.id, { plan });
  return { token, user, organization };
}

async function login(email) {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.data.token;
}

/** Cria o usuário pela rota do OWNER e devolve o token dele. */
async function createUser(ownerToken, data) {
  const res = await post('/api/users', ownerToken, { name: 'Usuário', password: PASSWORD, ...data });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return { user: res.body.data, token: await login(data.email) };
}

/** Setor com 1 turno, 2 funcionários e 1 ausência. */
async function seedDepartment(token, name) {
  const dept = (await post('/api/departments', token, { name })).body.data;
  const shift = (await post('/api/shifts', token, { departmentId: dept.id, name: 'Abertura', code: 'T1', startTime: '07:00', endTime: '16:24' })).body.data;
  const employees = [];
  for (const n of ['Pessoa Um', 'Pessoa Dois']) {
    employees.push((await post('/api/employees', token, { departmentId: dept.id, name: `${n} ${name}` })).body.data);
  }
  const absence = (await post('/api/absences', token, { employeeId: employees[0].id, type: 'OTHER', startDate: '2026-11-20', endDate: '2026-11-21' })).body.data;
  return { dept, shift, employees, absence };
}

describe('POST /api/users (cadastro pelo OWNER)', () => {
  it('OWNER cria líder de setor com departmentIds; senha em scrypt e sem hash na resposta', async () => {
    const owner = await registerOwner();
    const { dept } = await seedDepartment(owner.token, 'Açougue');
    const res = await post('/api/users', owner.token, {
      name: 'Leo Líder',
      email: 'LEO@example.com',
      password: PASSWORD,
      role: 'SECTION_LEADER',
      departmentIds: [dept.id],
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: 'Leo Líder', email: 'leo@example.com', role: 'SECTION_LEADER', departmentIds: [dept.id], organizationId: owner.organization.id });
    expect(res.body.data).not.toHaveProperty('passwordHash');
    const stored = await repositories.users.findByEmail('leo@example.com');
    expect(stored.passwordHash).toMatch(/^scrypt\$/);
    expect(stored.passwordHash).not.toContain(PASSWORD);
    expect(await login('leo@example.com')).toBeTruthy();
  });

  it('só o OWNER cria usuários (403 para os demais papéis)', async () => {
    const owner = await registerOwner();
    const { dept } = await seedDepartment(owner.token, 'Açougue');
    const manager = await createUser(owner.token, { email: 'gerente@example.com', role: 'STORE_MANAGER' });
    const leader = await createUser(owner.token, { email: 'leo@example.com', role: 'SECTION_LEADER', departmentIds: [dept.id] });
    const auditor = await createUser(owner.token, { email: 'aud@example.com', role: 'HR_AUDITOR' });
    for (const { token } of [manager, leader, auditor]) {
      const res = await post('/api/users', token, { name: 'X', email: 'x@example.com', password: PASSWORD, role: 'HR_AUDITOR' });
      expect(res.status).toBe(403);
    }
    expect(manager.user.departmentIds).toEqual([]);
  });

  it('valida entrada: líder sem setor, papel OWNER e senha curta → 400; e-mail repetido → 409', async () => {
    const owner = await registerOwner();
    const base = { name: 'X', email: 'x@example.com', password: PASSWORD };
    expect((await post('/api/users', owner.token, { ...base, role: 'SECTION_LEADER' })).status).toBe(400);
    expect((await post('/api/users', owner.token, { ...base, role: 'SECTION_LEADER', departmentIds: [] })).status).toBe(400);
    expect((await post('/api/users', owner.token, { ...base, role: 'OWNER' })).status).toBe(400);
    expect((await post('/api/users', owner.token, { ...base, role: 'HR_AUDITOR', password: 'curta' })).status).toBe(400);
    const dup = await post('/api/users', owner.token, { ...base, email: 'dono@example.com', role: 'HR_AUDITOR' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('EMAIL_IN_USE');
  });

  it('setor de outra organização → 404', async () => {
    const owner = await registerOwner();
    const other = await registerOwner('outra@example.com');
    const { dept } = await seedDepartment(other.token, 'Padaria');
    const res = await post('/api/users', owner.token, { name: 'X', email: 'x@example.com', password: PASSWORD, role: 'SECTION_LEADER', departmentIds: [dept.id] });
    expect(res.status).toBe(404);
  });
});

describe('SECTION_LEADER só opera nos próprios setores (item 1)', () => {
  let owner;
  let mine;
  let other;
  let leader;

  beforeEach(async () => {
    owner = await registerOwner();
    mine = await seedDepartment(owner.token, 'Açougue');
    other = await seedDepartment(owner.token, 'Padaria');
    leader = (await createUser(owner.token, { email: 'leo@example.com', role: 'SECTION_LEADER', departmentIds: [mine.dept.id] })).token;
  });

  it('lista só os próprios setores, funcionários, turnos e ausências', async () => {
    expect((await get('/api/departments', leader)).body.data.map((d) => d.id)).toEqual([mine.dept.id]);
    const employees = (await get('/api/employees', leader)).body.data;
    expect(employees.map((e) => e.id).sort()).toEqual(mine.employees.map((e) => e.id).sort());
    expect((await get('/api/shifts', leader)).body.data.map((s) => s.id)).toEqual([mine.shift.id]);
    expect((await get('/api/absences', leader)).body.data.map((a) => a.id)).toEqual([mine.absence.id]);
    // O OWNER continua vendo a organização inteira.
    expect((await get('/api/departments', owner.token)).body.data).toHaveLength(2);
    expect((await get('/api/employees', owner.token)).body.data).toHaveLength(4);
  });

  it('filtros por setor ou funcionário de fora do escopo → 404', async () => {
    for (const path of [
      `/api/employees?departmentId=${other.dept.id}`,
      `/api/shifts?departmentId=${other.dept.id}`,
      `/api/absences?departmentId=${other.dept.id}`,
      `/api/absences?employeeId=${other.employees[0].id}`,
      `/api/schedules?departmentId=${other.dept.id}&weekStart=${WEEK}`,
    ]) {
      expect((await get(path, leader)).status, path).toBe(404);
    }
  });

  it('GET, PATCH e DELETE de recurso de outro setor → 404 e nada muda', async () => {
    const targets = [
      ['departments', other.dept.id],
      ['employees', other.employees[0].id],
      ['shifts', other.shift.id],
      ['absences', other.absence.id],
    ];
    for (const [resource, id] of targets) {
      const url = `/api/${resource}/${id}`;
      expect((await get(url, leader)).status, `GET ${url}`).toBe(404);
      if (resource === 'departments') continue; // escrita de setor já é só de OWNER/STORE_MANAGER
      expect((await patch(url, leader, { name: 'Hackeado', notes: 'x' })).status, `PATCH ${url}`).toBe(404);
      expect((await del(url, leader)).status, `DELETE ${url}`).toBe(404);
    }
    expect((await get(`/api/employees/${other.employees[0].id}`, owner.token)).body.data.name).toBe('Pessoa Um Padaria');
    expect((await get(`/api/shifts/${other.shift.id}`, owner.token)).status).toBe(200);
    expect((await get(`/api/absences/${other.absence.id}`, owner.token)).status).toBe(200);
  });

  it('criar ou mover recurso para outro setor → 404', async () => {
    expect((await post('/api/employees', leader, { departmentId: other.dept.id, name: 'Intruso' })).status).toBe(404);
    expect((await post('/api/shifts', leader, { departmentId: other.dept.id, name: 'X', code: 'X1', startTime: '07:00', endTime: '15:00' })).status).toBe(404);
    expect((await post('/api/absences', leader, { employeeId: other.employees[0].id, type: 'OTHER', startDate: '2026-11-20', endDate: '2026-11-20' })).status).toBe(404);
    expect((await patch(`/api/employees/${mine.employees[0].id}`, leader, { departmentId: other.dept.id })).status).toBe(404);
    expect((await patch(`/api/shifts/${mine.shift.id}`, leader, { departmentId: other.dept.id })).status).toBe(404);
    expect((await patch(`/api/absences/${mine.absence.id}`, leader, { employeeId: other.employees[0].id })).status).toBe(404);
    expect((await get(`/api/employees/${mine.employees[0].id}`, owner.token)).body.data.departmentId).toBe(mine.dept.id);
  });

  it('escala de outro setor → 404; do próprio setor funciona', async () => {
    expect((await post('/api/schedules/generate', leader, { departmentId: other.dept.id, weekStartDate: WEEK })).status).toBe(404);
    expect((await put('/api/schedules', leader, { departmentId: other.dept.id, weekStartDate: WEEK, assignments: [] })).status).toBe(404);
    expect((await post('/api/schedules/generate', leader, { departmentId: mine.dept.id, weekStartDate: WEEK })).status).toBe(200);
    expect((await get(`/api/schedules?departmentId=${mine.dept.id}&weekStart=${WEEK}`, leader)).status).toBe(200);
  });

  it('no próprio setor o líder cria, altera e remove', async () => {
    const created = await post('/api/employees', leader, { departmentId: mine.dept.id, name: 'Nova Pessoa' });
    expect(created.status).toBe(201);
    expect((await patch(`/api/employees/${created.body.data.id}`, leader, { roleTitle: 'Açougueira' })).status).toBe(200);
    expect((await del(`/api/employees/${created.body.data.id}`, leader)).status).toBe(200);
  });

  it('setor removido sai do escopo: o líder dele não enxerga mais nada', async () => {
    const lonely = (await createUser(owner.token, { email: 'solo@example.com', role: 'SECTION_LEADER', departmentIds: [other.dept.id] })).token;
    expect((await del(`/api/departments/${other.dept.id}`, owner.token)).status).toBe(200);
    expect((await get('/api/departments', lonely)).body.data).toEqual([]);
    expect((await get('/api/employees', lonely)).body.data).toEqual([]);
    expect((await get('/api/shifts', lonely)).body.data).toEqual([]);
    expect((await get('/api/absences', lonely)).body.data).toEqual([]);
  });
});

describe('Magic Link (item 2)', () => {
  it('plano com portal: quem escreve vê o token; HR_AUDITOR não', async () => {
    const owner = await registerOwner();
    const { employees } = await seedDepartment(owner.token, 'Açougue');
    expect(employees[0].accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(employees[0].magicLinkUrl).toBe(`https://planilhaescala5x2.com.br/minha-escala/${employees[0].accessToken}`);

    const auditor = (await createUser(owner.token, { email: 'aud@example.com', role: 'HR_AUDITOR' })).token;
    const list = (await get('/api/employees', auditor)).body.data;
    const one = (await get(`/api/employees/${employees[0].id}`, auditor)).body.data;
    for (const employee of [...list, one]) {
      expect(employee).not.toHaveProperty('accessToken');
      expect(employee).not.toHaveProperty('magicLinkUrl');
    }
    expect(one.name).toBe('Pessoa Um Açougue');
  });

  it('plano FREE (sem portal): token omitido das respostas e rota pública → 404 genérico', async () => {
    const owner = await registerOwner('free@example.com', 'FREE');
    const { dept } = await seedDepartment(owner.token, 'Açougue');
    const created = await post('/api/employees', owner.token, { departmentId: dept.id, name: 'Sem Portal' });
    expect(created.status).toBe(201);
    const listed = (await get('/api/employees', owner.token)).body.data;
    for (const employee of [created.body.data, ...listed]) {
      expect(employee).not.toHaveProperty('accessToken');
      expect(employee).not.toHaveProperty('magicLinkUrl');
    }
    const stored = await repositories.employees.get(owner.organization.id, created.body.data.id);
    const blocked = await request(app).get(`/api/public/minha-escala/${stored.accessToken}`);
    const invalid = await request(app).get(`/api/public/minha-escala/${'z'.repeat(43)}`);
    expect(blocked.status).toBe(404);
    expect(blocked.body).toEqual(invalid.body);

    // Com upgrade para um plano com portal, o mesmo link passa a funcionar.
    await repositories.organizations.update(owner.organization.id, { plan: 'STORE_MULTI' });
    expect((await request(app).get(`/api/public/minha-escala/${stored.accessToken}`)).status).toBe(200);
  });

  it('assinatura cancelada rebaixa para FREE e derruba o portal', async () => {
    const owner = await registerOwner();
    const { employees } = await seedDepartment(owner.token, 'Açougue');
    expect((await request(app).get(`/api/public/minha-escala/${employees[0].accessToken}`)).status).toBe(200);
    await repositories.organizations.update(owner.organization.id, { subscriptionStatus: 'CANCELED' });
    expect((await request(app).get(`/api/public/minha-escala/${employees[0].accessToken}`)).status).toBe(404);
  });

  it('POST /:id/rotate-token troca o token, invalida o antigo e registra auditoria', async () => {
    const owner = await registerOwner();
    const { dept, employees } = await seedDepartment(owner.token, 'Açougue');
    const old = employees[0].accessToken;
    const res = await post(`/api/employees/${employees[0].id}/rotate-token`, owner.token);
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res.body.data.accessToken).not.toBe(old);
    expect(res.body.data.magicLinkUrl).toContain(res.body.data.accessToken);
    expect((await request(app).get(`/api/public/minha-escala/${old}`)).status).toBe(404);
    expect((await request(app).get(`/api/public/minha-escala/${res.body.data.accessToken}`)).status).toBe(200);
    const logs = await repositories.auditLogs.list(owner.organization.id, { departmentId: dept.id });
    expect(logs.map((l) => l.action)).toContain('ROTACIONOU_LINK');
    expect(JSON.stringify(logs)).not.toContain(res.body.data.accessToken);
  });

  it('rotação: HR_AUDITOR → 403, líder de outro setor → 404, funcionário inexistente → 404', async () => {
    const owner = await registerOwner();
    const mine = await seedDepartment(owner.token, 'Açougue');
    const other = await seedDepartment(owner.token, 'Padaria');
    const auditor = (await createUser(owner.token, { email: 'aud@example.com', role: 'HR_AUDITOR' })).token;
    const leader = (await createUser(owner.token, { email: 'leo@example.com', role: 'SECTION_LEADER', departmentIds: [mine.dept.id] })).token;
    expect((await post(`/api/employees/${mine.employees[0].id}/rotate-token`, auditor)).status).toBe(403);
    expect((await post(`/api/employees/${other.employees[0].id}/rotate-token`, leader)).status).toBe(404);
    expect((await post('/api/employees/inexistente/rotate-token', owner.token)).status).toBe(404);
    expect((await post(`/api/employees/${mine.employees[0].id}/rotate-token`, leader)).status).toBe(200);
  });

  it('rotação no plano FREE revoga o link antigo sem devolver o novo token', async () => {
    const owner = await registerOwner('free@example.com', 'FREE');
    const { employees } = await seedDepartment(owner.token, 'Açougue');
    const before = await repositories.employees.get(owner.organization.id, employees[0].id);
    const res = await post(`/api/employees/${employees[0].id}/rotate-token`, owner.token);
    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty('accessToken');
    const after = await repositories.employees.get(owner.organization.id, employees[0].id);
    expect(after.accessToken).not.toBe(before.accessToken);
  });
});

describe('repositório Prisma: usuários e uso de turno (sem banco)', () => {
  it('users.create liga os setores e devolve departmentIds; countByShift filtra pela organização', async () => {
    const calls = [];
    const prisma = {
      userAccount: {
        create: async (args) => {
          calls.push(args);
          return { id: 'u1', email: args.data.email, organizationId: 'org-1', role: 'SECTION_LEADER', departments: [{ id: 'd1' }] };
        },
      },
      dailyAssignment: {
        count: async (args) => {
          calls.push(args);
          return 3;
        },
      },
    };
    const repos = createPrismaRepositories(prisma);
    const user = await repos.users.create('org-1', { name: 'Leo', email: 'LEO@X.com', passwordHash: 'h', role: 'SECTION_LEADER', departmentIds: ['d1'] });
    expect(user.departmentIds).toEqual(['d1']);
    expect(user).not.toHaveProperty('departments');
    expect(calls[0].data).toMatchObject({ email: 'leo@x.com', organizationId: 'org-1', departments: { connect: [{ id: 'd1' }] } });
    expect(calls[0].data).not.toHaveProperty('departmentIds');
    expect(await repos.schedules.countByShift('org-1', 's1')).toBe(3);
    expect(calls[1].where).toEqual({ organizationId: 'org-1', shiftId: 's1' });
  });
});
