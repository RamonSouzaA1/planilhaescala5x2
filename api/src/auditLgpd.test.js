import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createMemoryRepositories } from './repositories/memory.js';
import { createPrismaRepositories } from './repositories/prisma.js';
import { signToken } from './security/tokens.js';
import { anonymizeIp } from './security/ip.js';
import { purgeAuditIps } from './routes/maintenance.js';

/**
 * Itens 9, 10 (API) e 12 da revisão final: trilha de auditoria e publicação, LGPD
 * (exclusão, exportação, retenção de IP, privacidade) e revogação de login.
 */

const SECRET = 'segredo-de-teste-com-mais-de-32-caracteres!!';
const WEEK = '2026-11-16';
const NOW = new Date('2026-11-18T15:00:00Z');
const PASSWORD = 'senha-forte-123';
const DAY_MS = 24 * 60 * 60 * 1000;

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
const put = (path, token, body) => request(app).put(path).set(auth(token)).send(body);
const del = (path, token, body) => request(app).delete(path).set(auth(token)).send(body);

async function registerOwner(email = 'dono@example.com') {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Dona Ana', email, password: PASSWORD, organizationName: `Org ${email}` });
  expect(res.status).toBe(201);
  const { token, user, organization } = res.body.data;
  await repositories.organizations.update(organization.id, { plan: 'STORE_MULTI' });
  return { token, user, organization };
}

async function login(email, password = PASSWORD) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res;
}

async function createUser(ownerToken, data) {
  const res = await post('/api/users', ownerToken, { name: 'Usuário', password: PASSWORD, ...data });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return { user: res.body.data, token: (await login(data.email)).body.data.token };
}

const SHIFTS = [
  { name: 'Abertura', code: 'T1', startTime: '07:00', endTime: '16:24' },
  { name: 'Intermediário', code: 'T2', startTime: '10:00', endTime: '19:24' },
  { name: 'Fechamento', code: 'T3', startTime: '13:00', endTime: '22:00' },
];

/** Setor com 3 turnos e `n` funcionários. */
async function seedDepartment(token, name = 'Açougue', n = 6) {
  const dept = (await post('/api/departments', token, { name })).body.data;
  const shifts = [];
  for (const s of SHIFTS) shifts.push((await post('/api/shifts', token, { ...s, departmentId: dept.id })).body.data);
  const team = [];
  for (let i = 0; i < n; i += 1) {
    team.push((await post('/api/employees', token, { departmentId: dept.id, name: `Pessoa${i} ${name}`, phone: `1199999000${i}` })).body.data);
  }
  return { dept, shifts, team };
}

const generate = (token, departmentId, weekStartDate = WEEK) => post('/api/schedules/generate', token, { departmentId, weekStartDate });
const parseDetails = (log) => JSON.parse(log.details);
const logsOf = (orgId, action) => repositories.auditLogs.list(orgId).then((l) => l.filter((x) => !action || x.action === action));

/** Sete dias de trabalho seguidos para um funcionário: gera alerta vermelho (folgas semanais). */
const redWeek = (deptId, shiftId, employeeId) => ({
  departmentId: deptId,
  weekStartDate: WEEK,
  assignments: ['16', '17', '18', '19', '20', '21', '22'].map((d) => ({ employeeId, date: `2026-11-${d}`, type: 'WORK', shiftId })),
});

describe('anonymizeIp', () => {
  it('zera o último octeto do IPv4 e os últimos 80 bits do IPv6', () => {
    expect(anonymizeIp('203.0.113.45')).toBe('203.0.113.0');
    expect(anonymizeIp('::ffff:203.0.113.45')).toBe('203.0.113.0');
    expect(anonymizeIp('2001:db8:1234:5678:9abc:def0:1234:5678')).toBe('2001:db8:1234::');
    expect(anonymizeIp('2001:db8::1')).toBe('2001:db8:0::');
    expect(anonymizeIp('::1')).toBe('0:0:0::');
    expect(anonymizeIp('fe80::1%eth0')).toBe('fe80:0:0::');
  });

  it('valor ausente ou inválido vira null (nada é gravado)', () => {
    for (const bad of [undefined, null, '', 'abc', '999.1.1.1', '1.2.3', '1:2:3:4:5:6:7:8:9', '1::2::3']) {
      expect(anonymizeIp(bad)).toBeNull();
    }
  });
});

describe('trilha de auditoria ao salvar e gerar (item 9)', () => {
  it('PUT guarda o estado anterior (compacto), o resumo do novo, o usuário e o IP anonimizado', async () => {
    const owner = await registerOwner();
    const { dept, shifts, team } = await seedDepartment(owner.token, 'Açougue', 2);
    const first = ['2026-11-16', '2026-11-17'].map((date) => ({ employeeId: team[0].id, date, type: 'WORK', shiftId: shifts[0].id, isPinned: true }));
    expect((await put('/api/schedules', owner.token, { departmentId: dept.id, weekStartDate: WEEK, assignments: first })).status).toBe(200);
    const second = [{ employeeId: team[1].id, date: '2026-11-18', type: 'OFF' }];
    expect((await put('/api/schedules', owner.token, { departmentId: dept.id, weekStartDate: WEEK, assignments: second })).status).toBe(200);

    const logs = (await logsOf(owner.organization.id, 'SALVOU_ESCALA')).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    expect(logs).toHaveLength(2);
    expect(parseDetails(logs[0])).toMatchObject({ weekStartDate: WEEK, statusBefore: null, before: [], after: { total: 2, work: 2, pinned: 2 } });
    const details = parseDetails(logs[1]);
    expect(details.statusBefore).toBe('DRAFT');
    expect(details.before).toEqual([
      { employeeId: team[0].id, date: '2026-11-16', type: 'WORK', shiftId: shifts[0].id, isPinned: true },
      { employeeId: team[0].id, date: '2026-11-17', type: 'WORK', shiftId: shifts[0].id, isPinned: true },
    ]);
    expect(details.after).toMatchObject({ total: 1, off: 1, work: 0 });
    expect(logs[1]).toMatchObject({ userId: owner.user.id, departmentId: dept.id });
    // supertest conecta por ::ffff:127.0.0.1 → o último octeto some
    expect(logs[1].ip).toBe('127.0.0.0');
  });

  it('POST /generate registra o estado anterior da semana', async () => {
    const owner = await registerOwner();
    const { dept } = await seedDepartment(owner.token);
    expect((await generate(owner.token, dept.id)).status).toBe(200);
    expect((await generate(owner.token, dept.id)).status).toBe(200);
    const logs = await logsOf(owner.organization.id, 'GEROU_ESCALA');
    const sizes = logs.map((l) => parseDetails(l).before.length).sort((a, b) => a - b);
    expect(sizes).toEqual([0, 42]);
    expect(parseDetails(logs[0]).after.total).toBe(42);
  });

  it('as demais rotas também gravam IP anonimizado (usuários e rotação de link)', async () => {
    const owner = await registerOwner();
    const { team } = await seedDepartment(owner.token, 'Açougue', 1);
    await post('/api/users', owner.token, { name: 'Aud', email: 'aud@example.com', password: PASSWORD, role: 'HR_AUDITOR' });
    await post(`/api/employees/${team[0].id}/rotate-token`, owner.token);
    for (const log of await logsOf(owner.organization.id)) {
      if (log.ip) expect(log.ip).toMatch(/\.0$/);
    }
    expect((await logsOf(owner.organization.id, 'CRIOU_USUARIO'))[0].ip).toBe('127.0.0.0');
  });
});

describe('POST /api/schedules/publish (item 9)', () => {
  it('escala sem vermelho é publicada: status, publishedAt/By e snapshot imutável no AuditLog', async () => {
    const owner = await registerOwner();
    const { dept } = await seedDepartment(owner.token);
    await generate(owner.token, dept.id);

    const res = await post('/api/schedules/publish', owner.token, { departmentId: dept.id, weekStartDate: WEEK });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.cycle).toMatchObject({ status: 'PUBLISHED', publishedBy: owner.user.id, publishedAt: NOW.toISOString() });

    const week = await get(`/api/schedules?departmentId=${dept.id}&weekStart=${WEEK}`, owner.token);
    expect(week.body.data.status).toBe('PUBLISHED');
    expect(week.body.data.cycle.status).toBe('PUBLISHED');

    const [log] = await logsOf(owner.organization.id, 'PUBLICOU_ESCALA');
    const details = parseDetails(log);
    expect(details).toMatchObject({ weekStartDate: WEEK, publishedBy: owner.user.id, publishedAt: NOW.toISOString() });
    expect(details.assignments).toHaveLength(42);
    expect(details.assignments[0]).toHaveProperty('isPinned');
    expect(details.validation.red).toBe(0);
  });

  it('semana inexistente → 422; já publicada → 200 sem novo registro', async () => {
    const owner = await registerOwner();
    const { dept } = await seedDepartment(owner.token);
    const body = { departmentId: dept.id, weekStartDate: WEEK };
    expect((await post('/api/schedules/publish', owner.token, body)).status).toBe(422);
    await generate(owner.token, dept.id);
    await post('/api/schedules/publish', owner.token, body);
    const again = await post('/api/schedules/publish', owner.token, body);
    expect(again.status).toBe(200);
    expect(again.body.data.alreadyPublished).toBe(true);
    expect(await logsOf(owner.organization.id, 'PUBLICOU_ESCALA')).toHaveLength(1);
  });

  it('com alerta vermelho responde 409 SCHEDULE_HAS_VIOLATIONS com a lista e não publica', async () => {
    const owner = await registerOwner();
    const { dept, shifts, team } = await seedDepartment(owner.token, 'Açougue', 1);
    expect((await put('/api/schedules', owner.token, redWeek(dept.id, shifts[0].id, team[0].id))).status).toBe(200);

    const res = await post('/api/schedules/publish', owner.token, { departmentId: dept.id, weekStartDate: WEEK });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SCHEDULE_HAS_VIOLATIONS');
    expect(res.body.error.details.red).toBeGreaterThan(0);
    expect(res.body.error.details.issues[0]).toMatchObject({ severity: 'RED' });
    expect(res.body.error.details.issues[0]).toHaveProperty('code');
    expect(res.body.error.details.issues[0]).not.toHaveProperty('details');

    const week = await get(`/api/schedules?departmentId=${dept.id}&weekStart=${WEEK}`, owner.token);
    expect(week.body.data.status).toBe('DRAFT');
    expect(await logsOf(owner.organization.id, 'PUBLICOU_ESCALA')).toHaveLength(0);
  });

  it('editar uma semana publicada a devolve para DRAFT e registra a explicação', async () => {
    const owner = await registerOwner();
    const { dept, team } = await seedDepartment(owner.token);
    await generate(owner.token, dept.id);
    await post('/api/schedules/publish', owner.token, { departmentId: dept.id, weekStartDate: WEEK });

    const edit = await put('/api/schedules', owner.token, {
      departmentId: dept.id,
      weekStartDate: WEEK,
      assignments: [{ employeeId: team[0].id, date: WEEK, type: 'OFF' }],
    });
    expect(edit.status).toBe(200);
    expect(edit.body.data.cycle).toMatchObject({ status: 'DRAFT', publishedAt: null, publishedBy: null });
    const week = await get(`/api/schedules?departmentId=${dept.id}&weekStart=${WEEK}`, owner.token);
    expect(week.body.data.status).toBe('DRAFT');

    const [back] = await logsOf(owner.organization.id, 'VOLTOU_PARA_RASCUNHO');
    expect(parseDetails(back).message).toContain('voltou para rascunho');
    const saved = (await logsOf(owner.organization.id, 'SALVOU_ESCALA'))[0];
    expect(parseDetails(saved).statusBefore).toBe('PUBLISHED');
    // O snapshot publicado continua intacto no log original.
    expect(parseDetails((await logsOf(owner.organization.id, 'PUBLICOU_ESCALA'))[0]).assignments).toHaveLength(42);
  });

  it('gerar de novo sobre semana publicada também volta para DRAFT', async () => {
    const owner = await registerOwner();
    const { dept } = await seedDepartment(owner.token);
    await generate(owner.token, dept.id);
    await post('/api/schedules/publish', owner.token, { departmentId: dept.id, weekStartDate: WEEK });
    expect((await generate(owner.token, dept.id)).body.data.cycle.status).toBe('DRAFT');
    expect(await logsOf(owner.organization.id, 'VOLTOU_PARA_RASCUNHO')).toHaveLength(1);
  });

  it('papéis e escopo: HR_AUDITOR 403, líder de outro setor 404, líder do setor publica, outra organização 404', async () => {
    const owner = await registerOwner();
    const mine = await seedDepartment(owner.token, 'Açougue');
    const other = await seedDepartment(owner.token, 'Padaria');
    await generate(owner.token, mine.dept.id);
    await generate(owner.token, other.dept.id);
    const auditor = (await createUser(owner.token, { email: 'aud@example.com', role: 'HR_AUDITOR' })).token;
    const leader = (await createUser(owner.token, { email: 'leo@example.com', role: 'SECTION_LEADER', departmentIds: [mine.dept.id] })).token;
    const stranger = await registerOwner('outro@example.com');

    const body = (d) => ({ departmentId: d.dept.id, weekStartDate: WEEK });
    expect((await post('/api/schedules/publish', auditor, body(mine))).status).toBe(403);
    expect((await post('/api/schedules/publish', leader, body(other))).status).toBe(404);
    expect((await post('/api/schedules/publish', stranger.token, body(mine))).status).toBe(404);
    expect((await post('/api/schedules/publish', leader, body(mine))).status).toBe(200);
    const otherWeek = await get(`/api/schedules?departmentId=${other.dept.id}&weekStart=${WEEK}`, owner.token);
    expect(otherWeek.body.data.status).toBe('DRAFT');
  });
});

describe('GET /api/audit-logs (item 9)', () => {
  async function seedLogs() {
    const owner = await registerOwner();
    const a = await seedDepartment(owner.token, 'Açougue', 1);
    const b = await seedDepartment(owner.token, 'Padaria', 1);
    for (const [dept, action] of [[a, 'SALVOU_ESCALA'], [a, 'GEROU_ESCALA'], [b, 'SALVOU_ESCALA'], [b, 'GEROU_ESCALA']]) {
      await repositories.auditLogs.create(owner.organization.id, { departmentId: dept.dept.id, userId: owner.user.id, action, details: '{}', ip: '10.0.0.0', timestamp: NOW.toISOString() });
    }
    return { owner, a, b };
  }
  const logsUrl = (query = '') => `/api/audit-logs${query}`;

  it('OWNER, STORE_MANAGER e HR_AUDITOR leem a organização inteira, mais recentes primeiro', async () => {
    const { owner, a, b } = await seedLogs();
    await repositories.auditLogs.create(owner.organization.id, { departmentId: a.dept.id, action: 'ANTIGO', details: '{}', timestamp: '2026-01-01T10:00:00.000Z' });
    await repositories.auditLogs.create(owner.organization.id, { departmentId: b.dept.id, action: 'NOVO', details: '{}', timestamp: '2026-12-01T10:00:00.000Z' });
    const manager = (await createUser(owner.token, { email: 'ger@example.com', role: 'STORE_MANAGER' })).token;
    const auditor = (await createUser(owner.token, { email: 'aud@example.com', role: 'HR_AUDITOR' })).token;
    for (const token of [owner.token, manager, auditor]) {
      const res = await get(logsUrl('?limit=100'), token);
      expect(res.status).toBe(200);
      const actions = res.body.data.items.map((l) => l.action);
      expect(actions[0]).toBe('NOVO');
      expect(actions).toContain('ANTIGO');
      expect(actions.indexOf('NOVO')).toBeLessThan(actions.indexOf('ANTIGO'));
      expect(res.body.data).toMatchObject({ limit: 100, offset: 0 });
    }
  });

  it('pagina (limit ≤ 100, offset) e rejeita limit acima de 100', async () => {
    const { owner } = await seedLogs();
    const total = await repositories.auditLogs.count(owner.organization.id);
    const page1 = await get(logsUrl('?limit=2&offset=0'), owner.token);
    const page2 = await get(logsUrl('?limit=2&offset=2'), owner.token);
    expect(page1.body.data.items).toHaveLength(2);
    expect(page1.body.data.total).toBe(total);
    expect(page2.body.data.items[0].id).not.toBe(page1.body.data.items[0].id);
    expect(page2.body.data.items.map((l) => l.id)).not.toContain(page1.body.data.items[1].id);
    expect((await get(logsUrl('?limit=101'), owner.token)).status).toBe(400);
    expect((await get(logsUrl('?limit=0'), owner.token)).status).toBe(400);
    expect((await get(logsUrl('?offset=-1'), owner.token)).status).toBe(400);
  });

  it('filtra por setor e por período (dias de Brasília)', async () => {
    const { owner, a, b } = await seedLogs();
    const mk = (departmentId, action, timestamp) => repositories.auditLogs.create(owner.organization.id, { departmentId, action, details: '{}', timestamp });
    await mk(a.dept.id, 'A_JAN', '2026-01-10T12:00:00.000Z');
    await mk(a.dept.id, 'A_FEV', '2026-02-10T12:00:00.000Z');
    await mk(b.dept.id, 'B_FEV', '2026-02-11T12:00:00.000Z');
    await mk(a.dept.id, 'A_BORDA', '2026-02-11T02:30:00.000Z'); // 10/02 23:30 em Brasília

    const bySector = await get(logsUrl(`?departmentId=${a.dept.id}&from=2026-02-01&to=2026-02-10`), owner.token);
    expect(bySector.body.data.items.map((l) => l.action).sort()).toEqual(['A_BORDA', 'A_FEV']);
    const all = await get(logsUrl('?from=2026-02-01&to=2026-02-28'), owner.token);
    expect(all.body.data.items.map((l) => l.action).sort()).toEqual(['A_BORDA', 'A_FEV', 'B_FEV']);
    expect((await get(logsUrl('?from=2026-03-01&to=2026-02-01'), owner.token)).status).toBe(400);
    expect((await get(logsUrl('?from=ontem'), owner.token)).status).toBe(400);
    expect((await get(logsUrl('?departmentId=nao-existe'), owner.token)).status).toBe(404);
  });

  it('líder só vê os próprios setores; setor de fora → 404; logs sem setor ficam ocultos', async () => {
    const { owner, a, b } = await seedLogs();
    const leader = (await createUser(owner.token, { email: 'leo@example.com', role: 'SECTION_LEADER', departmentIds: [a.dept.id] })).token;
    await repositories.auditLogs.create(owner.organization.id, { action: 'SEM_SETOR', details: '{}', timestamp: NOW.toISOString() });
    const res = await get(logsUrl('?limit=100'), leader);
    expect(res.status).toBe(200);
    const items = res.body.data.items;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((l) => l.departmentId === a.dept.id)).toBe(true);
    expect(items.map((l) => l.action)).not.toContain('SEM_SETOR');
    expect(res.body.data.total).toBe(items.length);
    expect((await get(logsUrl(`?departmentId=${b.dept.id}`), leader)).status).toBe(404);
    expect((await get(logsUrl(`?departmentId=${a.dept.id}`), leader)).status).toBe(200);
  });

  it('isolamento entre organizações e exigência de login', async () => {
    const { owner } = await seedLogs();
    const stranger = await registerOwner('outro@example.com');
    await seedDepartment(stranger.token, 'Outro setor', 1);
    const res = await get(logsUrl('?limit=100'), stranger.token);
    expect(res.body.data.items.every((l) => l.organizationId === stranger.organization.id)).toBe(true);
    expect(res.body.data.items.some((l) => l.organizationId === owner.organization.id)).toBe(false);
    expect((await request(app).get(logsUrl())).status).toBe(401);
  });

  it('AuditLog não pode ser alterado nem apagado por nenhuma rota nem pelo repositório', async () => {
    const { owner } = await seedLogs();
    const [log] = (await get(logsUrl(), owner.token)).body.data.items;
    for (const method of ['put', 'patch', 'delete', 'post']) {
      for (const path of [`/api/audit-logs/${log.id}`, '/api/audit-logs']) {
        const res = await request(app)[method](path).set(auth(owner.token)).send({ action: 'X' });
        expect([404, 405]).toContain(res.status);
      }
    }
    const still = await repositories.auditLogs.get(owner.organization.id, log.id);
    expect(still.action).toBe(log.action);
    expect(repositories.auditLogs).not.toHaveProperty('update');
    expect(repositories.auditLogs).not.toHaveProperty('remove');
  });
});

describe('GET /api/privacy (item 10)', () => {
  it('é pública e descreve coleta, finalidade, retenção, direitos e contato', async () => {
    const res = await request(app).get('/api/privacy');
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.contact).toBe('privacidade@planilhaescala5x2.com.br');
    expect(data.collected.map((c) => c.data)).toEqual(expect.arrayContaining(['Nome', 'Função (cargo e papel de acesso)', 'Telefone']));
    expect(data.collected.find((c) => c.data === 'Telefone').required).toBe(false);
    expect(data.purpose).toBeTruthy();
    expect(data.retention.auditIp).toContain('180 dias');
    expect(data.rights.length).toBeGreaterThanOrEqual(4);
  });
});

describe('GET /api/organizations/me/export (item 10)', () => {
  it('exporta tudo da organização como download, sem hashes de senha nem tokens', async () => {
    const owner = await registerOwner();
    const { dept, team } = await seedDepartment(owner.token);
    await generate(owner.token, dept.id);
    await createUser(owner.token, { email: 'leo@example.com', role: 'SECTION_LEADER', departmentIds: [dept.id] });
    const stranger = await registerOwner('outro@example.com');
    await seedDepartment(stranger.token, 'Padaria alheia', 1);

    const res = await get('/api/organizations/me/export', owner.token);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="planilhaescala5x2-dados-2026-11-18\.json"$/);
    expect(res.headers['content-type']).toContain('application/json');
    const data = JSON.parse(res.text);
    expect(data).toMatchObject({ format: 'planilhaescala5x2-export-v1', exportedAt: NOW.toISOString() });
    expect(data.organization.id).toBe(owner.organization.id);
    expect(data.users.map((u) => u.email).sort()).toEqual(['dono@example.com', 'leo@example.com']);
    expect(data.users.find((u) => u.email === 'leo@example.com').departmentIds).toEqual([dept.id]);
    expect(data.departments).toHaveLength(1);
    expect(data.employees).toHaveLength(team.length);
    expect(data.dailyAssignments).toHaveLength(42);
    expect(data.scheduleCycles).toHaveLength(1);
    expect(data.auditLogs.length).toBeGreaterThan(0);

    const text = res.text;
    const stored = await repositories.users.findByEmail('dono@example.com');
    expect(text).not.toContain('passwordHash');
    expect(text).not.toContain(stored.passwordHash);
    expect(text).not.toContain('scrypt$');
    expect(text).not.toContain('accessToken');
    expect(text).not.toContain(team[0].accessToken);
    expect(text).not.toContain('tokenVersion');
    expect(text).not.toContain('Padaria alheia');
    expect(text).not.toContain(stranger.organization.id);
  });

  it('só o OWNER exporta (403 para os demais, 401 sem login)', async () => {
    const owner = await registerOwner();
    const manager = (await createUser(owner.token, { email: 'ger@example.com', role: 'STORE_MANAGER' })).token;
    const auditor = (await createUser(owner.token, { email: 'aud@example.com', role: 'HR_AUDITOR' })).token;
    expect((await get('/api/organizations/me/export', manager)).status).toBe(403);
    expect((await get('/api/organizations/me/export', auditor)).status).toBe(403);
    expect((await request(app).get('/api/organizations/me/export')).status).toBe(401);
  });
});

describe('DELETE /api/organizations/me (item 10)', () => {
  it('exige a senha; sem senha → 400, senha errada → 403, e nada é apagado', async () => {
    const owner = await registerOwner();
    await seedDepartment(owner.token, 'Açougue', 1);
    expect((await del('/api/organizations/me', owner.token, {})).status).toBe(400);
    const wrong = await del('/api/organizations/me', owner.token, { password: 'errada-errada' });
    expect(wrong.status).toBe(403);
    expect(wrong.body.error.code).toBe('INVALID_PASSWORD');
    expect(await repositories.organizations.get(owner.organization.id)).not.toBeNull();
    expect(await repositories.departments.count(owner.organization.id)).toBe(1);
  });

  it('só o OWNER exclui (403 para os demais)', async () => {
    const owner = await registerOwner();
    const manager = await createUser(owner.token, { email: 'ger@example.com', role: 'STORE_MANAGER' });
    expect((await del('/api/organizations/me', manager.token, { password: PASSWORD })).status).toBe(403);
    expect(await repositories.organizations.get(owner.organization.id)).not.toBeNull();
  });

  it('apaga a organização e tudo em cascata (204), sem tocar em outra organização', async () => {
    const owner = await registerOwner();
    const { dept, team } = await seedDepartment(owner.token);
    await generate(owner.token, dept.id);
    await post('/api/absences', owner.token, { employeeId: team[0].id, type: 'OTHER', startDate: '2026-11-20', endDate: '2026-11-21' });
    const leader = await createUser(owner.token, { email: 'leo@example.com', role: 'SECTION_LEADER', departmentIds: [dept.id] });
    const stranger = await registerOwner('outro@example.com');
    const strangerData = await seedDepartment(stranger.token, 'Padaria', 2);
    await generate(stranger.token, strangerData.dept.id);

    const res = await del('/api/organizations/me', owner.token, { password: PASSWORD });
    expect(res.status).toBe(204);
    expect(res.text).toBe('');

    const orgId = owner.organization.id;
    expect(await repositories.organizations.get(orgId)).toBeNull();
    expect(await repositories.users.findByEmail('dono@example.com')).toBeNull();
    expect(await repositories.users.findByEmail('leo@example.com')).toBeNull();
    expect(await repositories.departments.list(orgId)).toEqual([]);
    expect(await repositories.employees.list(orgId)).toEqual([]);
    expect(await repositories.shifts.list(orgId)).toEqual([]);
    expect(await repositories.absences.list(orgId)).toEqual([]);
    expect(await repositories.auditLogs.list(orgId)).toEqual([]);
    expect(await repositories.schedules.listWeek(orgId, dept.id, WEEK)).toEqual([]);
    expect(await repositories.schedules.findCycle(orgId, dept.id, WEEK)).toBeNull();
    expect(await repositories.employees.findByAccessToken(team[0].accessToken)).toBeNull();
    expect((await get('/api/auth/me', owner.token)).status).toBe(401);
    expect((await get('/api/auth/me', leader.token)).status).toBe(401);
    expect((await login('dono@example.com')).status).toBe(401);

    // A outra organização segue intacta.
    expect(await repositories.organizations.get(stranger.organization.id)).not.toBeNull();
    expect(await repositories.employees.count(stranger.organization.id)).toBe(2);
    expect((await get(`/api/schedules?departmentId=${strangerData.dept.id}&weekStart=${WEEK}`, stranger.token)).body.data.assignments).toHaveLength(14);
    expect((await get('/api/auth/me', stranger.token)).status).toBe(200);
  });
});

describe('retenção do IP do AuditLog (item 10)', () => {
  const OLD = new Date(NOW.getTime() - 200 * DAY_MS).toISOString();
  const RECENT = new Date(NOW.getTime() - 10 * DAY_MS).toISOString();

  it('POST /maintenance/purge-audit-ips remove o IP de registros com mais de 180 dias, só da própria organização', async () => {
    const owner = await registerOwner();
    const stranger = await registerOwner('outro@example.com');
    const mk = (orgId, timestamp) => repositories.auditLogs.create(orgId, { action: 'X', details: '{}', ip: '10.0.0.0', timestamp });
    const oldLog = await mk(owner.organization.id, OLD);
    const recentLog = await mk(owner.organization.id, RECENT);
    const strangerOld = await mk(stranger.organization.id, OLD);

    const res = await post('/api/maintenance/purge-audit-ips', owner.token);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ purged: 1, retentionDays: 180, cutoff: new Date(NOW.getTime() - 180 * DAY_MS).toISOString() });
    expect((await repositories.auditLogs.get(owner.organization.id, oldLog.id)).ip).toBeNull();
    expect((await repositories.auditLogs.get(owner.organization.id, recentLog.id)).ip).toBe('10.0.0.0');
    expect((await repositories.auditLogs.get(stranger.organization.id, strangerOld.id)).ip).toBe('10.0.0.0');
    // Idempotente; o restante do registro não muda.
    expect((await post('/api/maintenance/purge-audit-ips', owner.token)).body.data.purged).toBe(0);
    expect((await repositories.auditLogs.get(owner.organization.id, oldLog.id)).action).toBe('X');
  });

  it('só o OWNER roda a limpeza; a retenção é configurável', async () => {
    const owner = await registerOwner();
    const manager = (await createUser(owner.token, { email: 'ger@example.com', role: 'STORE_MANAGER' })).token;
    expect((await post('/api/maintenance/purge-audit-ips', manager)).status).toBe(403);
    expect((await request(app).post('/api/maintenance/purge-audit-ips')).status).toBe(401);

    expect(loadConfig({ NODE_ENV: 'test', AUDIT_IP_RETENTION_DAYS: '30' }).auditIpRetentionDays).toBe(30);
    expect(loadConfig({ NODE_ENV: 'test', AUDIT_IP_RETENTION_DAYS: 'abc' }).auditIpRetentionDays).toBe(180);
    expect(loadConfig({ NODE_ENV: 'test' }).auditIpRetentionDays).toBe(180);

    const org = owner.organization.id;
    await repositories.auditLogs.create(org, { action: 'X', details: '{}', ip: '1.2.3.0', timestamp: new Date(NOW.getTime() - 40 * DAY_MS).toISOString() });
    const result = await purgeAuditIps(repositories.auditLogs, org, NOW, 30);
    expect(result.purged).toBe(1);
  });
});

describe('revogação de login (item 12)', () => {
  it('o JWT carrega tv e começa em 0; token sem tv (antigo) continua valendo enquanto tokenVersion for 0', async () => {
    const owner = await registerOwner();
    const payload = JSON.parse(Buffer.from(owner.token.split('.')[1], 'base64url').toString());
    expect(payload.tv).toBe(0);
    const legacy = signToken({ id: owner.user.id, organizationId: owner.organization.id, role: 'OWNER' }, SECRET);
    expect((await get('/api/auth/me', legacy)).status).toBe(200);
  });

  it('POST /auth/logout-all revoga todos os tokens do usuário (401 TOKEN_REVOKED) e não afeta os outros', async () => {
    const owner = await registerOwner();
    const second = (await login('dono@example.com')).body.data.token;
    const manager = await createUser(owner.token, { email: 'ger@example.com', role: 'STORE_MANAGER' });

    const res = await post('/api/auth/logout-all', owner.token);
    expect(res.status).toBe(204);
    for (const token of [owner.token, second]) {
      const me = await get('/api/auth/me', token);
      expect(me.status).toBe(401);
      expect(me.body.error.code).toBe('TOKEN_REVOKED');
    }
    expect((await get('/api/auth/me', manager.token)).status).toBe(200);
    // Novo login emite token com a versão atual.
    const fresh = (await login('dono@example.com')).body.data.token;
    expect(JSON.parse(Buffer.from(fresh.split('.')[1], 'base64url').toString()).tv).toBe(1);
    expect((await get('/api/auth/me', fresh)).status).toBe(200);
    expect((await logsOf(owner.organization.id, 'ENCERROU_SESSOES')).length).toBe(1);
  });

  it('logout-all exige login', async () => {
    expect((await request(app).post('/api/auth/logout-all')).status).toBe(401);
  });

  it('POST /auth/change-password troca a senha, revoga os tokens antigos e devolve token novo', async () => {
    const owner = await registerOwner();
    const res = await post('/api/auth/change-password', owner.token, { currentPassword: PASSWORD, newPassword: 'outra-senha-456' });
    expect(res.status).toBe(200);
    const newToken = res.body.data.token;

    const old = await get('/api/auth/me', owner.token);
    expect(old.status).toBe(401);
    expect(old.body.error.code).toBe('TOKEN_REVOKED');
    expect((await get('/api/auth/me', newToken)).status).toBe(200);
    expect((await login('dono@example.com', PASSWORD)).status).toBe(401);
    expect((await login('dono@example.com', 'outra-senha-456')).status).toBe(200);
    const stored = await repositories.users.findByEmail('dono@example.com');
    expect(stored.passwordHash).toMatch(/^scrypt\$/);
    expect(res.text).not.toContain(stored.passwordHash);
    expect((await logsOf(owner.organization.id, 'ALTEROU_SENHA')).length).toBe(1);
  });

  it('change-password: senha atual errada → 403, nova curta → 400, sem login → 401; nada muda', async () => {
    const owner = await registerOwner();
    const wrong = await post('/api/auth/change-password', owner.token, { currentPassword: 'errada-errada', newPassword: 'outra-senha-456' });
    expect(wrong.status).toBe(403);
    expect(wrong.body.error.code).toBe('INVALID_PASSWORD');
    expect((await post('/api/auth/change-password', owner.token, { currentPassword: PASSWORD, newPassword: 'curta' })).status).toBe(400);
    expect((await post('/api/auth/change-password', owner.token, { newPassword: 'outra-senha-456' })).status).toBe(400);
    expect((await request(app).post('/api/auth/change-password').send({ currentPassword: PASSWORD, newPassword: 'outra-senha-456' })).status).toBe(401);
    expect((await get('/api/auth/me', owner.token)).status).toBe(200);
    expect((await login('dono@example.com')).status).toBe(200);
  });

  it('as respostas de usuário não expõem tokenVersion nem hash', async () => {
    const owner = await registerOwner();
    const me = await get('/api/auth/me', owner.token);
    expect(JSON.stringify(me.body)).not.toContain('tokenVersion');
    expect(JSON.stringify(me.body)).not.toContain('passwordHash');
  });
});

describe('repositório Prisma: métodos novos (sem banco, delegate falso)', () => {
  /** Delegate que registra chamadas e devolve valores simples por método. */
  function fakePrisma(overrides = {}) {
    const calls = [];
    const delegate = (model) =>
      new Proxy({}, {
        get: (_t, method) => async (args) => {
          calls.push({ model, method, args });
          const custom = overrides[`${model}.${method}`];
          if (custom) return custom(args);
          return method === 'findMany' ? [] : method === 'count' ? 0 : method === 'updateMany' || method === 'deleteMany' ? { count: 0 } : null;
        },
      });
    const prisma = new Proxy({}, { get: (_t, model) => (model === '$transaction' ? (fn) => fn(prisma) : delegate(model)) });
    return { prisma, calls };
  }

  it('organizations.remove apaga pela organização (cascata do schema) e devolve false em P2025', async () => {
    const { prisma, calls } = fakePrisma();
    expect(await createPrismaRepositories(prisma).organizations.remove('org-1')).toBe(true);
    expect(calls[0]).toMatchObject({ model: 'organization', method: 'delete', args: { where: { id: 'org-1' } } });
    const missing = fakePrisma({ 'organization.delete': () => Promise.reject(Object.assign(new Error('x'), { code: 'P2025' })) });
    expect(await createPrismaRepositories(missing.prisma).organizations.remove('org-x')).toBe(false);
    const broken = fakePrisma({ 'organization.delete': () => Promise.reject(new Error('banco fora')) });
    await expect(createPrismaRepositories(broken.prisma).organizations.remove('org-x')).rejects.toThrow('banco fora');
  });

  it('organizations.exportData consulta toda tabela da organização filtrando por organizationId', async () => {
    const { prisma, calls } = fakePrisma({
      'organization.findUnique': () => ({ id: 'org-1', name: 'Org', planExpiresAt: new Date('2026-12-01T00:00:00Z') }),
      'userAccount.findMany': () => [{ id: 'u1', email: 'a@b.c', passwordHash: 'h', departments: [{ id: 'd1' }] }],
    });
    const data = await createPrismaRepositories(prisma).organizations.exportData('org-1');
    expect(data.organization.planExpiresAt).toBe('2026-12-01T00:00:00.000Z');
    expect(data.users[0].departmentIds).toEqual(['d1']);
    expect(data.users[0]).not.toHaveProperty('departments');
    expect(Object.keys(data)).toEqual(
      expect.arrayContaining(['stores', 'departments', 'employees', 'shifts', 'coverageRules', 'absences', 'scheduleCycles', 'dailyAssignments', 'swapRequests', 'paymentTransactions', 'auditLogs']),
    );
    const queried = calls.filter((c) => c.method === 'findMany');
    expect(queried.map((c) => c.model).sort()).toEqual(
      ['absence', 'auditLog', 'coverageRule', 'dailyAssignment', 'department', 'employee', 'paymentTransaction', 'scheduleCycle', 'shiftSwapRequest', 'shiftTemplate', 'store', 'userAccount'].sort(),
    );
    for (const { args } of queried) expect(args.where).toEqual({ organizationId: 'org-1' });
    const missing = fakePrisma();
    expect(await createPrismaRepositories(missing.prisma).organizations.exportData('nada')).toBeNull();
  });

  it('users.bumpTokenVersion e changePassword incrementam tokenVersion; id inexistente → null', async () => {
    const { prisma, calls } = fakePrisma({ 'userAccount.update': (args) => ({ id: args.where.id, tokenVersion: 4, departments: [] }) });
    const repos = createPrismaRepositories(prisma);
    expect((await repos.users.bumpTokenVersion('u1')).tokenVersion).toBe(4);
    await repos.users.changePassword('u1', 'novo-hash');
    expect(calls[0].args.data).toEqual({ tokenVersion: { increment: 1 } });
    expect(calls[1].args.data).toEqual({ passwordHash: 'novo-hash', tokenVersion: { increment: 1 } });
    const missing = fakePrisma({ 'userAccount.update': () => Promise.reject(Object.assign(new Error('x'), { code: 'P2025' })) });
    expect(await createPrismaRepositories(missing.prisma).users.bumpTokenVersion('nada')).toBeNull();
  });

  it('auditLogs: sem update/remove; query pagina por organização/setor/período; purgeIps só zera o IP antigo', async () => {
    const { prisma, calls } = fakePrisma({ 'auditLog.findMany': () => [{ id: 'l1', timestamp: new Date('2026-02-01T00:00:00Z') }], 'auditLog.count': () => 7, 'auditLog.updateMany': () => ({ count: 3 }) });
    const repos = createPrismaRepositories(prisma);
    expect(repos.auditLogs).not.toHaveProperty('update');
    expect(repos.auditLogs).not.toHaveProperty('remove');

    const page = await repos.auditLogs.query('org-1', { departmentIds: ['d1', 'd2'], from: '2026-02-01T03:00:00.000Z', to: '2026-03-01T03:00:00.000Z', limit: 10, offset: 20 });
    expect(page).toEqual({ items: [{ id: 'l1', timestamp: '2026-02-01T00:00:00.000Z' }], total: 7 });
    const find = calls.find((c) => c.method === 'findMany').args;
    expect(find).toMatchObject({ skip: 20, take: 10, orderBy: [{ timestamp: 'desc' }, { id: 'desc' }] });
    expect(find.where).toMatchObject({ organizationId: 'org-1', departmentId: { in: ['d1', 'd2'] } });
    expect(find.where.timestamp.gte).toEqual(new Date('2026-02-01T03:00:00.000Z'));
    expect(find.where.timestamp.lt).toEqual(new Date('2026-03-01T03:00:00.000Z'));

    expect(await repos.auditLogs.purgeIps('org-1', '2026-01-01T00:00:00.000Z')).toBe(3);
    const purge = calls.find((c) => c.method === 'updateMany').args;
    expect(purge.data).toEqual({ ip: null });
    expect(purge.where).toMatchObject({ organizationId: 'org-1', ip: { not: null } });
    expect(purge.where.timestamp.lt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
  });

  it('schedules.saveWeek devolve o ciclo para DRAFT; publishCycle filtra pela organização', async () => {
    const { prisma, calls } = fakePrisma({
      'scheduleCycle.upsert': () => ({ id: 'c1', status: 'DRAFT' }),
      'scheduleCycle.updateMany': () => ({ count: 1 }),
      'scheduleCycle.findFirst': () => ({ id: 'c1', status: 'PUBLISHED', publishedAt: new Date('2026-11-18T15:00:00Z'), publishedBy: 'u1' }),
    });
    const repos = createPrismaRepositories(prisma);
    await repos.schedules.saveWeek('org-1', { departmentId: 'd1', weekStartDate: WEEK, cycleWeek: 1, assignments: [] });
    expect(calls.find((c) => c.method === 'upsert').args.update).toEqual({ cycleWeek: 1, status: 'DRAFT', publishedAt: null, publishedBy: null });

    const cycle = await repos.schedules.publishCycle('org-1', 'c1', { publishedAt: NOW.toISOString(), publishedBy: 'u1' });
    expect(cycle).toMatchObject({ status: 'PUBLISHED', publishedAt: NOW.toISOString(), publishedBy: 'u1' });
    const update = calls.find((c) => c.method === 'updateMany').args;
    expect(update.where).toEqual({ id: 'c1', organizationId: 'org-1' });
    expect(update.data).toMatchObject({ status: 'PUBLISHED', publishedBy: 'u1' });

    const none = fakePrisma({ 'scheduleCycle.updateMany': () => ({ count: 0 }) });
    expect(await createPrismaRepositories(none.prisma).schedules.publishCycle('org-2', 'c1', { publishedAt: NOW.toISOString(), publishedBy: 'u1' })).toBeNull();
  });
});

describe('datas fora do padrão (regressão do dateString)', () => {
  it('texto que não é data vira 400 (antes estourava 500 no parseDate)', async () => {
    const owner = await registerOwner();
    const { dept } = await seedDepartment(owner.token, 'Açougue', 1);
    expect((await get(`/api/schedules?departmentId=${dept.id}&weekStart=ontem`, owner.token)).status).toBe(400);
    expect((await get('/api/audit-logs?to=amanha', owner.token)).status).toBe(400);
  });
});
