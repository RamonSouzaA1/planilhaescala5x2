import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createMemoryRepositories } from './repositories/memory.js';
import { createPrismaRepositories } from './repositories/prisma.js';
import { signToken } from './security/tokens.js';
import { hashPassword, verifyPassword } from './security/password.js';

const SECRET = 'segredo-de-teste-com-mais-de-32-caracteres!!';
const WEEK = '2026-11-16'; // segunda-feira
const NOW = new Date('2026-11-18T15:00:00Z'); // quarta-feira

let repositories;
let app;

/** Opções de rate limit folgadas para os testes. */
const baseConfig = (extra = {}) => ({
  jwtSecret: SECRET,
  corsOrigins: ['http://localhost:5173'],
  now: () => NOW,
  rateLimit: { windowMs: 60_000, authMax: 1000, publicMax: 1000 },
  ...extra,
});

beforeEach(() => {
  repositories = createMemoryRepositories();
  app = createApp({ repositories, config: baseConfig() });
});

async function register(email = 'ana@example.com', extra = {}) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Ana Souza', email, password: 'senha-forte-123', organizationName: `Org ${email}`, ...extra });
  expect(res.status).toBe(201);
  return { token: res.body.data.token, user: res.body.data.user, organization: res.body.data.organization };
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const post = (path, token, body) => request(app).post(path).set(auth(token)).send(body);

const SHIFTS = [
  { name: 'Abertura', code: 'T1', startTime: '07:00', endTime: '16:24' },
  { name: 'Intermediário', code: 'T2', startTime: '10:00', endTime: '19:24' },
  { name: 'Fechamento', code: 'T3', startTime: '13:00', endTime: '22:00' },
];

/** Setor com 3 turnos e `n` funcionários. */
async function seedDepartment(token, n = 6) {
  const dept = (await post('/api/departments', token, { name: 'Açougue' })).body.data;
  const shifts = [];
  for (const s of SHIFTS) shifts.push((await post('/api/shifts', token, { ...s, departmentId: dept.id })).body.data);
  const team = [];
  for (let i = 0; i < n; i += 1) {
    const res = await post('/api/employees', token, {
      departmentId: dept.id,
      name: `Pessoa${i} Sobrenome`,
      phone: `1199999000${i}`,
      tags: ['Serra'],
    });
    team.push(res.body.data);
  }
  return { dept, shifts, team };
}

describe('auth', () => {
  it('registra, cria organização FREE com referralCode e devolve JWT HS256 de 7 dias', async () => {
    const { token, user, organization } = await register();
    expect(organization.plan).toBe('FREE');
    expect(organization.referralCode).toMatch(/^[A-Z2-9]{8}$/);
    expect(user.role).toBe('OWNER');
    expect(user).not.toHaveProperty('passwordHash');

    const [header, payload] = token.split('.').slice(0, 2).map((p) => JSON.parse(Buffer.from(p, 'base64url').toString()));
    expect(header.alg).toBe('HS256');
    expect(payload).toMatchObject({ sub: user.id, organizationId: organization.id, role: 'OWNER' });
    expect(payload.exp - payload.iat).toBe(7 * 24 * 3600);

    const stored = await repositories.users.findByEmail('ana@example.com');
    expect(stored.passwordHash).toMatch(/^scrypt\$/);
    expect(stored.passwordHash).not.toContain('senha-forte-123');
  });

  it('login correto devolve token e GET /me devolve usuário e organização', async () => {
    await register();
    const login = await request(app).post('/api/auth/login').send({ email: 'ANA@example.com', password: 'senha-forte-123' });
    expect(login.status).toBe(200);
    expect(login.body.success).toBe(true);
    const me = await request(app).get('/api/auth/me').set(auth(login.body.data.token));
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe('ana@example.com');
    expect(me.body.data.organization.plan).toBe('FREE');
  });

  it('senha errada e e-mail inexistente dão a mesma mensagem genérica (401)', async () => {
    await register();
    const wrong = await request(app).post('/api/auth/login').send({ email: 'ana@example.com', password: 'senha-errada-1' });
    const unknown = await request(app).post('/api/auth/login').send({ email: 'ninguem@example.com', password: 'senha-errada-1' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejeita e-mail duplicado com 409', async () => {
    await register();
    const res = await request(app).post('/api/auth/register').send({ name: 'Outra', email: 'ana@example.com', password: 'outra-senha-123' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_IN_USE');
  });

  it('valida entrada com zod: e-mail inválido e senha curta → 400', async () => {
    const badEmail = await request(app).post('/api/auth/register').send({ name: 'A', email: 'nao-e-email', password: 'senha-forte-123' });
    const shortPw = await request(app).post('/api/auth/register').send({ name: 'A', email: 'a@example.com', password: '1234567' });
    for (const res of [badEmail, shortPw]) {
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    }
  });

  it('rota autenticada sem token, com token inválido, adulterado ou expirado → 401', async () => {
    const { user, token } = await register();
    expect((await request(app).get('/api/departments')).status).toBe(401);
    expect((await request(app).get('/api/departments').set(auth('lixo'))).status).toBe(401);
    expect((await request(app).get('/api/departments').set(auth(`${token.slice(0, -3)}abc`))).status).toBe(401);

    const expired = signToken(user, SECRET, { expiresIn: -10 });
    const res = await request(app).get('/api/departments').set(auth(expired));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');

    const wrongKey = signToken(user, 'outro-segredo-com-mais-de-32-caracteres!!!');
    expect((await request(app).get('/api/departments').set(auth(wrongKey))).status).toBe(401);
  });

  it('hash scrypt usa salt aleatório e verifica em tempo constante', async () => {
    const [a, b] = await Promise.all([hashPassword('segredo123'), hashPassword('segredo123')]);
    expect(a).not.toBe(b);
    expect(await verifyPassword('segredo123', a)).toBe(true);
    expect(await verifyPassword('segredo124', a)).toBe(false);
    expect(await verifyPassword('x', 'formato-invalido')).toBe(false);
  });
});

describe('multi-tenant: isolamento entre organizações', () => {
  it('a org B não lê, não altera e não apaga recursos da org A (404)', async () => {
    const a = await register('a@example.com');
    const b = await register('b@example.com');
    const { dept, shifts, team } = await seedDepartment(a.token, 2);
    const absence = (
      await post('/api/absences', a.token, { employeeId: team[0].id, type: 'VACATION', startDate: '2026-11-20', endDate: '2026-11-25' })
    ).body.data;

    const targets = [
      ['departments', dept.id],
      ['employees', team[0].id],
      ['shifts', shifts[0].id],
      ['absences', absence.id],
    ];
    for (const [resource, id] of targets) {
      const url = `/api/${resource}/${id}`;
      expect((await request(app).get(url).set(auth(b.token))).status, `GET ${url}`).toBe(404);
      expect((await request(app).patch(url).set(auth(b.token)).send({ name: 'Hackeado' })).status, `PATCH ${url}`).toBe(404);
      expect((await request(app).delete(url).set(auth(b.token))).status, `DELETE ${url}`).toBe(404);
    }

    // Listagens da B vazias; a A continua intacta.
    expect((await request(app).get('/api/departments').set(auth(b.token))).body.data).toEqual([]);
    expect((await request(app).get('/api/employees').set(auth(b.token))).body.data).toEqual([]);
    expect((await request(app).get('/api/employees').set(auth(a.token))).body.data).toHaveLength(2);
    expect((await request(app).get(`/api/departments/${dept.id}`).set(auth(a.token))).body.data.name).toBe('Açougue');

    // Referenciar o setor/funcionário da A a partir da B também é 404.
    expect((await post('/api/employees', b.token, { departmentId: dept.id, name: 'Intruso' })).status).toBe(404);
    expect((await post('/api/shifts', b.token, { ...SHIFTS[0], departmentId: dept.id })).status).toBe(404);
    expect((await post('/api/absences', b.token, { employeeId: team[0].id, type: 'OTHER', startDate: '2026-11-20', endDate: '2026-11-21' })).status).toBe(404);
    expect((await request(app).get(`/api/employees?departmentId=${dept.id}`).set(auth(b.token))).status).toBe(404);
    expect((await request(app).get(`/api/schedules?departmentId=${dept.id}&weekStart=${WEEK}`).set(auth(b.token))).status).toBe(404);
    expect((await post('/api/schedules/generate', b.token, { departmentId: dept.id, weekStartDate: WEEK })).status).toBe(404);
    expect((await request(app).put('/api/schedules').set(auth(b.token)).send({ departmentId: dept.id, weekStartDate: WEEK, assignments: [] })).status).toBe(404);
  });

  it('ignora organizationId enviado no corpo: o recurso nasce na organização do token', async () => {
    const a = await register('a@example.com');
    const b = await register('b@example.com');
    const res = await post('/api/departments', b.token, { name: 'Padaria', organizationId: a.organization.id });
    expect(res.status).toBe(201);
    expect((await request(app).get('/api/departments').set(auth(a.token))).body.data).toEqual([]);
    expect((await request(app).get('/api/departments').set(auth(b.token))).body.data).toHaveLength(1);
  });

  it('HR_AUDITOR lê mas não altera (403)', async () => {
    const { user } = await repositories.accounts.register({
      organization: { name: 'Org auditoria', plan: 'FREE', referralCode: 'AUDITORX' },
      user: { name: 'Aud', email: 'aud@example.com', passwordHash: 'x', role: 'HR_AUDITOR' },
    });
    const token = signToken(user, SECRET);
    expect((await request(app).get('/api/departments').set(auth(token))).status).toBe(200);
    const res = await post('/api/departments', token, { name: 'Nova' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('validação e regras de plano', () => {
  it('payload inválido → 400 com formato padrão', async () => {
    const { token } = await register();
    const dept = (await post('/api/departments', token, { name: 'Açougue' })).body.data;
    const cases = [
      post('/api/departments', token, { name: '' }),
      post('/api/departments', token, { name: 'X', weeklyHoursTarget: 99 }),
      post('/api/employees', token, { departmentId: dept.id }),
      post('/api/shifts', token, { departmentId: dept.id, name: 'T', code: 'T1', startTime: '25:00', endTime: '10:00' }),
      post('/api/absences', token, { employeeId: 'x', type: 'VACATION', startDate: '2026-11-20', endDate: '2026-11-10' }),
      request(app).get(`/api/schedules?departmentId=${dept.id}&weekStart=2026-11-17`).set(auth(token)), // terça
      request(app).get('/api/schedules').set(auth(token)),
    ];
    for (const res of await Promise.all(cases)) {
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    const badJson = await request(app).post('/api/departments').set(auth(token)).set('Content-Type', 'application/json').send('{oops');
    expect(badJson.status).toBe(400);
    expect(badJson.body.error.code).toBe('INVALID_JSON');
  });

  it('FREE: 1 setor; 2º setor → 403. Passa a permitir mais com STORE_MULTI', async () => {
    const { token, organization } = await register();
    expect((await post('/api/departments', token, { name: 'A' })).status).toBe(201);
    const blocked = await post('/api/departments', token, { name: 'B' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PLAN_LIMIT_DEPARTMENTS');
    await repositories.organizations.update(organization.id, { plan: 'STORE_MULTI' });
    expect((await post('/api/departments', token, { name: 'B' })).status).toBe(201);
  });

  it('FREE não bloqueia mais de 10 funcionários (paywall é na exportação)', async () => {
    const { token } = await register();
    const dept = (await post('/api/departments', token, { name: 'A' })).body.data;
    for (let i = 0; i < 12; i += 1) {
      expect((await post('/api/employees', token, { departmentId: dept.id, name: `F${i}` })).status).toBe(201);
    }
    expect((await request(app).get(`/api/employees?departmentId=${dept.id}`).set(auth(token))).body.data).toHaveLength(12);
  });

  it('gera accessToken base64url de 32 bytes e não permite alterá-lo por PATCH', async () => {
    const { token } = await register();
    const dept = (await post('/api/departments', token, { name: 'A' })).body.data;
    const emp = (await post('/api/employees', token, { departmentId: dept.id, name: 'João' })).body.data;
    expect(emp.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(emp.magicLinkUrl).toBe(`https://planilhaescala5x2.com.br/minha-escala/${emp.accessToken}`);
    const patched = await request(app).patch(`/api/employees/${emp.id}`).set(auth(token)).send({ accessToken: 'x', roleTitle: 'Açougueiro' });
    expect(patched.body.data.accessToken).toBe(emp.accessToken);
    expect(patched.body.data.roleTitle).toBe('Açougueiro');
    expect(patched.body.data.name).toBe('João'); // PATCH parcial não zera os outros campos
  });

  it('Passe Transição expirado é rebaixado para FREE e persiste, preservando os dados', async () => {
    const { token, organization } = await register();
    const { team } = await seedDepartment(token, 3);
    await repositories.organizations.update(organization.id, { plan: 'TRANSITION_PASS', planExpiresAt: '2026-01-01T00:00:00.000Z' });

    const res = await request(app).get('/api/employees').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(team.length);

    const stored = await repositories.organizations.get(organization.id);
    expect(stored.plan).toBe('FREE');
    const me = await request(app).get('/api/auth/me').set(auth(token));
    expect(me.body.data.organization.plan).toBe('FREE');
  });

  it('Passe Transição ainda válido é mantido', async () => {
    const { token, organization } = await register();
    await repositories.organizations.update(organization.id, { plan: 'TRANSITION_PASS', planExpiresAt: '2027-01-01T00:00:00.000Z' });
    await request(app).get('/api/departments').set(auth(token));
    expect((await repositories.organizations.get(organization.id)).plan).toBe('TRANSITION_PASS');
  });
});

describe('schedules', () => {
  it('generate → GET devolve a escala com validação verde (equipe de 6, 3 turnos)', async () => {
    const { token } = await register();
    const { dept, team } = await seedDepartment(token, 6);

    const gen = await post('/api/schedules/generate', token, { departmentId: dept.id, weekStartDate: WEEK });
    expect(gen.status).toBe(200);
    expect(gen.body.data.assignments).toHaveLength(6 * 7);
    expect(gen.body.data.validation.status).toBe('GREEN');

    const get = await request(app).get(`/api/schedules?departmentId=${dept.id}&weekStart=${WEEK}`).set(auth(token));
    expect(get.status).toBe(200);
    expect(get.body.data.assignments).toHaveLength(42);
    expect(get.body.data.validation.status).toBe('GREEN');
    expect(get.body.data.validation.summary.total).toBe(0);
    expect(get.body.data.cycle).toMatchObject({ weekStartDate: WEEK, status: 'DRAFT' });
    for (const e of team) {
      const mine = get.body.data.assignments.filter((a) => a.employeeId === e.id);
      expect(mine.filter((a) => a.type === 'WORK')).toHaveLength(5);
      expect(mine.filter((a) => a.type === 'OFF')).toHaveLength(2);
    }

    const logs = await repositories.auditLogs.list((await repositories.users.findByEmail('ana@example.com')).organizationId);
    expect(logs.map((l) => l.action)).toContain('GEROU_ESCALA');
  });

  it('PUT salva as atribuições, devolve a validação e grava AuditLog; GET reflete', async () => {
    const { token, user } = await register();
    const { dept, shifts, team } = await seedDepartment(token, 1);
    const dates = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'];
    const assignments = dates.map((date, i) => ({
      employeeId: team[0].id,
      date,
      type: i < 5 ? 'WORK' : 'OFF',
      shiftId: i < 5 ? shifts[0].id : undefined,
    }));
    const put = await request(app).put('/api/schedules').set(auth(token)).send({ departmentId: dept.id, weekStartDate: WEEK, assignments });
    expect(put.status).toBe(200);
    expect(put.body.data.assignments).toHaveLength(7);
    expect(put.body.data.validation.issues.filter((i) => i.code === 'WEEKLY_OFF_COUNT')).toHaveLength(0);

    // Regravar substitui (sem duplicar)
    await request(app).put('/api/schedules').set(auth(token)).send({ departmentId: dept.id, weekStartDate: WEEK, assignments: assignments.slice(0, 3) });
    const get = await request(app).get(`/api/schedules?departmentId=${dept.id}&weekStart=${WEEK}`).set(auth(token));
    expect(get.body.data.assignments).toHaveLength(3);

    const logs = await repositories.auditLogs.list(user.organizationId, { departmentId: dept.id });
    expect(logs.filter((l) => l.action === 'SALVOU_ESCALA')).toHaveLength(2);
    expect(logs[0]).toMatchObject({ userId: user.id });
  });

  it('PUT rejeita funcionário de fora do setor, data fora da semana e WORK sem turno (400)', async () => {
    const { token } = await register();
    const { dept, team } = await seedDepartment(token, 1);
    const put = (assignments) => request(app).put('/api/schedules').set(auth(token)).send({ departmentId: dept.id, weekStartDate: WEEK, assignments });
    expect((await put([{ employeeId: 'inexistente', date: WEEK, type: 'OFF' }])).status).toBe(400);
    expect((await put([{ employeeId: team[0].id, date: '2026-11-30', type: 'OFF' }])).status).toBe(400);
    expect((await put([{ employeeId: team[0].id, date: WEEK, type: 'WORK' }])).status).toBe(400);
  });

  it('generate sem turnos → 422', async () => {
    const { token } = await register();
    const dept = (await post('/api/departments', token, { name: 'A' })).body.data;
    await post('/api/employees', token, { departmentId: dept.id, name: 'F' });
    const res = await post('/api/schedules/generate', token, { departmentId: dept.id, weekStartDate: WEEK });
    expect(res.status).toBe(422);
  });
});

describe('Magic Link público', () => {
  it('devolve só o mínimo (LGPD) e a data do próximo domingo de folga', async () => {
    const { token, organization } = await register();
    const { dept, team } = await seedDepartment(token, 6);
    await post('/api/schedules/generate', token, { departmentId: dept.id, weekStartDate: WEEK });
    await post('/api/schedules/generate', token, { departmentId: dept.id, weekStartDate: '2026-11-23' });

    const me = team[0];
    const res = await request(app).get(`/api/public/minha-escala/${me.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const data = res.body.data;
    expect(Object.keys(data).sort()).toEqual(['departmentName', 'firstName', 'nextSundayOff', 'today', 'weeks']);
    expect(data.firstName).toBe('Pessoa0');
    expect(data.departmentName).toBe('Açougue');
    expect(data.today).toBe('2026-11-18');
    expect(data.weeks.map((w) => w.weekStartDate)).toEqual([WEEK, '2026-11-23']);
    const workDay = data.weeks[0].days.find((d) => d.type === 'WORK');
    expect(Object.keys(workDay.shift).sort()).toEqual(['code', 'endTime', 'name', 'startTime']);
    expect(Object.keys(workDay).sort()).toEqual(['date', 'dayOfWeek', 'shift', 'type']);
    expect(data.nextSundayOff.date >= '2026-11-18').toBe(true);
    expect(new Date(`${data.nextSundayOff.date}T00:00:00Z`).getUTCDay()).toBe(0);
    expect(data.nextSundayOff.daysUntil).toBeGreaterThanOrEqual(0);

    // Sem vazamento de campos nem de dados de terceiros.
    const body = JSON.stringify(res.body);
    for (const secret of [me.id, me.accessToken, me.phone, 'Serra', 'Sobrenome', organization.id, organization.name, dept.id, team[1].id, team[1].name, 'Pessoa1']) {
      expect(body, `vazou: ${secret}`).not.toContain(secret);
    }
  });

  it('token inválido, inexistente ou de funcionário inativo → 404 genérico idêntico', async () => {
    const { token } = await register();
    const { team } = await seedDepartment(token, 1);
    await request(app).patch(`/api/employees/${team[0].id}`).set(auth(token)).send({ status: 'INACTIVE' });
    const responses = await Promise.all([
      request(app).get('/api/public/minha-escala/curto'),
      request(app).get(`/api/public/minha-escala/${'a'.repeat(43)}`),
      request(app).get(`/api/public/minha-escala/${team[0].accessToken}`),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual(responses[0].body);
      expect(res.body.success).toBe(false);
    }
  });

  it('é somente leitura: POST/PUT/DELETE não existem na rota pública', async () => {
    const { token } = await register();
    const { team } = await seedDepartment(token, 1);
    const url = `/api/public/minha-escala/${team[0].accessToken}`;
    for (const method of ['post', 'put', 'patch', 'delete']) {
      expect((await request(app)[method](url).send({})).status).toBe(404);
    }
  });
});

describe('segurança HTTP', () => {
  it('CORS libera a origem configurada e bloqueia a não permitida', async () => {
    const ok = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const evil = await request(app).get('/api/health').set('Origin', 'https://evil.example.com');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
    const preflight = await request(app)
      .options('/api/auth/login')
      .set('Origin', 'https://evil.example.com')
      .set('Access-Control-Request-Method', 'POST');
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('envia cabeçalhos do helmet e não expõe x-powered-by', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('rate limit nas rotas de auth e do Magic Link → 429', async () => {
    const limited = createApp({ repositories, config: baseConfig({ rateLimit: { windowMs: 60_000, authMax: 2, publicMax: 2 } }) });
    const login = () => request(limited).post('/api/auth/login').send({ email: 'x@example.com', password: 'qualquer-coisa' });
    expect((await login()).status).toBe(401);
    expect((await login()).status).toBe(401);
    const blocked = await login();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');

    const pub = () => request(limited).get(`/api/public/minha-escala/${'b'.repeat(43)}`);
    await pub();
    await pub();
    expect((await pub()).status).toBe(429);
  });

  it('corpo acima de 1mb → 413 no formato padrão', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'a@example.com', password: 'x'.repeat(1_100_000) });
    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({ success: false, error: { code: 'PAYLOAD_TOO_LARGE' } });
  });

  it('erro interno em produção não vaza stack nem mensagem; em dev inclui stack', async () => {
    const boom = { ...createMemoryRepositories() };
    boom.users = { ...boom.users, findByEmail: async () => { throw new Error('segredo interno do banco'); } };
    for (const isProduction of [true, false]) {
      const broken = createApp({ repositories: boom, config: baseConfig({ isProduction }) });
      const res = await request(broken).post('/api/auth/login').send({ email: 'a@example.com', password: 'qualquer-coisa' });
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
      expect(res.body.error.message).not.toContain('segredo interno');
      expect('stack' in res.body.error).toBe(!isProduction);
    }
  });

  it('rota inexistente → 404 no formato padrão', async () => {
    const res = await request(app).get('/api/nao-existe');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });
});

describe('config', () => {
  const silent = { logger: { info() {}, warn() {}, error() {} } };

  it('produção exige JWT_SECRET com 32+ caracteres', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' }, silent)).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'curto' }, silent)).toThrow(/JWT_SECRET/);
    expect(() =>
      loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'troque-isto-por-um-segredo-longo-e-aleatorio' }, silent),
    ).toThrow(/valor de exemplo/);
    const cfg = loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32), CORS_ORIGIN: 'https://a.com, https://b.com/' }, silent);
    expect(cfg.corsOrigins).toEqual(['https://a.com', 'https://b.com']);
    expect(cfg.publicAppUrl).toBe('https://planilhaescala5x2.com.br');
  });

  it('desenvolvimento usa segredo efêmero aleatório e CORS em localhost:5173', () => {
    const warnings = [];
    const logger = { info() {}, error() {}, warn: (m) => warnings.push(m) };
    const a = loadConfig({ NODE_ENV: 'development' }, { logger });
    const b = loadConfig({ NODE_ENV: 'development' }, { logger });
    expect(a.jwtSecret).toHaveLength(96);
    expect(a.jwtSecret).not.toBe(b.jwtSecret);
    expect(a.corsOrigins).toContain('http://localhost:5173');
    expect(warnings.some((w) => w.includes('JWT_SECRET'))).toBe(true);
    expect(a.databaseUrl).toBeUndefined();
  });
});

describe('repositório Prisma (escopo por organização, sem banco)', () => {
  it('todas as consultas incluem organizationId', async () => {
    const calls = [];
    const delegate = new Proxy({}, {
      get: (_t, method) => async (args) => {
        calls.push({ method, args });
        return method === 'findMany' ? [] : method === 'count' ? 0 : method === 'findFirst' ? null : { count: 0 };
      },
    });
    const repos = createPrismaRepositories({ department: delegate, employee: delegate, shiftTemplate: delegate, absence: delegate, coverageRule: delegate, auditLog: delegate });
    await repos.departments.list('org-1');
    await repos.departments.get('org-1', 'd1');
    await repos.employees.update('org-1', 'e1', { name: 'x', organizationId: 'org-2' });
    await repos.employees.remove('org-1', 'e1');
    await repos.shifts.count('org-1', { departmentId: 'd1' });
    for (const { args } of calls) {
      expect(args.where.organizationId).toBe('org-1');
    }
    expect(calls.find((c) => c.method === 'updateMany').args.data).not.toHaveProperty('organizationId');
  });
});

describe('intervalo intrajornada dos turnos (F10)', () => {
  it('POST rejeita intervalo acima de 120 min e intervalo que não cabe no turno (400)', async () => {
    const { token } = await register();
    const dept = (await post('/api/departments', token, { name: 'Açougue' })).body.data;
    const base = { departmentId: dept.id, name: 'Turno', code: 'TX' };

    const tooLong = await post('/api/shifts', token, { ...base, startTime: '07:00', endTime: '19:00', breakDurationMinutes: 150 });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.code).toBe('VALIDATION_ERROR');

    const notFitting = await post('/api/shifts', token, { ...base, startTime: '07:00', endTime: '08:00', breakDurationMinutes: 60 });
    expect(notFitting.status).toBe(400);
    expect(JSON.stringify(notFitting.body.error)).toContain('menor que a duração do turno');

    const overnight = await post('/api/shifts', token, { ...base, startTime: '22:00', endTime: '06:00', breakDurationMinutes: 60 });
    expect(overnight.status).toBe(201);
    const maxBreak = await post('/api/shifts', token, { ...base, code: 'TY', startTime: '07:00', endTime: '17:00', breakDurationMinutes: 120 });
    expect(maxBreak.status).toBe(201);
  });

  it('PATCH confere o intervalo contra o turno gravado', async () => {
    const { token } = await register();
    const { shifts } = await seedDepartment(token, 1);
    const url = `/api/shifts/${shifts[0].id}`; // 07:00–16:24, intervalo padrão de 60 min
    const patch = (body) => request(app).patch(url).set(auth(token)).send(body);

    expect((await patch({ endTime: '07:30' })).status).toBe(400); // 30 min de turno com 60 de intervalo
    expect((await patch({ breakDurationMinutes: 121 })).status).toBe(400);
    const ok = await patch({ breakDurationMinutes: 90 });
    expect(ok.status).toBe(200);
    expect(ok.body.data.breakDurationMinutes).toBe(90);
    expect((await request(app).get(url).set(auth(token))).body.data.endTime).toBe('16:24');
  });
});

describe('virada para a semana seguinte (F10)', () => {
  it('GET da semana W aponta interjornada com a segunda de W+1 já gravada', async () => {
    const { token } = await register();
    const { dept, shifts, team } = await seedDepartment(token, 1);
    const [t1, , t3] = shifts;
    const nextWeek = '2026-11-23';
    const cells = (start, codes) =>
      codes.map((code, i) => {
        const date = new Date(`${start}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() + i);
        const shift = code === 'T1' ? t1 : code === 'T3' ? t3 : null;
        return { employeeId: team[0].id, date: date.toISOString().slice(0, 10), type: shift ? 'WORK' : 'OFF', shiftId: shift?.id };
      });
    const put = (weekStartDate, assignments) =>
      request(app).put('/api/schedules').set(auth(token)).send({ departmentId: dept.id, weekStartDate, assignments });

    expect((await put(WEEK, cells(WEEK, ['O', 'O', 'T3', 'T3', 'T3', 'T3', 'T3']))).status).toBe(200);
    const before = await request(app).get(`/api/schedules?departmentId=${dept.id}&weekStart=${WEEK}`).set(auth(token));
    expect(before.body.data.validation.issues.map((i) => i.code)).not.toContain('INTERJORNADA');

    expect((await put(nextWeek, cells(nextWeek, ['T1', 'T1', 'O', 'O', 'T1', 'T1', 'T1']))).status).toBe(200);
    const after = await request(app).get(`/api/schedules?departmentId=${dept.id}&weekStart=${WEEK}`).set(auth(token));
    const issue = after.body.data.validation.issues.find((i) => i.code === 'INTERJORNADA');
    expect(issue).toMatchObject({ severity: 'RED', date: '2026-11-22', employeeId: team[0].id });
    expect(issue.details).toMatchObject({ restMinutes: 9 * 60, nextWeekDate: nextWeek });
  });
});
