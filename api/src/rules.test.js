import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createMemoryRepositories } from './repositories/memory.js';

/**
 * Itens 3, 4, 5, 7, 13, 14, 15 e 17 do backlog (seção 9) no servidor.
 */

const SECRET = 'segredo-de-teste-com-mais-de-32-caracteres!!';
const PASSWORD = 'senha-forte-123';

let repositories;
let now;
let app;

beforeEach(() => {
  repositories = createMemoryRepositories();
  now = new Date('2026-11-18T15:00:00Z');
  app = createApp({
    repositories,
    config: { jwtSecret: SECRET, now: () => now, rateLimit: { windowMs: 60_000, authMax: 1000, publicMax: 1000 } },
  });
});

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const get = (path, token) => request(app).get(path).set(auth(token));
const post = (path, token, body = {}) => request(app).post(path).set(auth(token)).send(body);
const patch = (path, token, body) => request(app).patch(path).set(auth(token)).send(body);
const put = (path, token, body) => request(app).put(path).set(auth(token)).send(body);
const del = (path, token) => request(app).delete(path).set(auth(token));

async function registerOwner(email = 'dono@example.com', plan = 'STORE_MULTI') {
  const res = await request(app).post('/api/auth/register').send({ name: 'Dona Ana', email, password: PASSWORD });
  expect(res.status).toBe(201);
  const { token, organization } = res.body.data;
  if (plan !== 'FREE') await repositories.organizations.update(organization.id, { plan });
  return { token, organization };
}

const SHIFT = { name: 'Abertura', code: 'T1', startTime: '07:00', endTime: '16:24' };

/** 7 células a partir da segunda `weekStart`: 'W' = trabalho no turno, 'O' = folga. */
function weekCells(employeeId, shiftId, weekStart, pattern) {
  return [...pattern].map((c, i) => {
    const date = new Date(`${weekStart}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + i);
    return { employeeId, date: date.toISOString().slice(0, 10), type: c === 'W' ? 'WORK' : 'OFF', shiftId: c === 'W' ? shiftId : undefined };
  });
}

describe('meta semanal: inteira e até o teto legal da data de hoje (itens 3 e 17)', () => {
  it('rejeita meta fracionária', async () => {
    const { token } = await registerOwner();
    const res = await post('/api/departments', token, { name: 'Açougue', weeklyHoursTarget: 41.5 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('até 14/12/2026 aceita 44h', async () => {
    const { token } = await registerOwner();
    const res = await post('/api/departments', token, { name: 'Açougue', weeklyHoursTarget: 44 });
    expect(res.status).toBe(201);
    expect(res.body.data.weeklyHoursTarget).toBe(44);
  });

  it('a partir de 15/12/2026 recusa acima de 42h, no POST e no PATCH', async () => {
    const { token } = await registerOwner();
    now = new Date('2027-01-10T15:00:00Z');
    const over = await post('/api/departments', token, { name: 'Açougue', weeklyHoursTarget: 43 });
    expect(over.status).toBe(400);
    expect(JSON.stringify(over.body.error)).toContain('42');
    const ok = await post('/api/departments', token, { name: 'Açougue', weeklyHoursTarget: 42 });
    expect(ok.status).toBe(201);
    expect((await patch(`/api/departments/${ok.body.data.id}`, token, { weeklyHoursTarget: 44 })).status).toBe(400);
    expect((await patch(`/api/departments/${ok.body.data.id}`, token, { weeklyHoursTarget: 40 })).body.data.weeklyHoursTarget).toBe(40);
  });

  it('a partir de 15/12/2027 o padrão da meta vira 40h', async () => {
    const { token } = await registerOwner();
    now = new Date('2028-01-10T15:00:00Z');
    const res = await post('/api/departments', token, { name: 'Açougue' });
    expect(res.status).toBe(201);
    expect(res.body.data.weeklyHoursTarget).toBe(40);
    expect((await post('/api/departments', token, { name: 'Padaria', weeklyHoursTarget: 42 })).status).toBe(400);
  });

  it('a data de hoje é a de Brasília', async () => {
    const { token } = await registerOwner();
    now = new Date('2026-12-15T02:30:00Z'); // 14/12/2026 23:30 em Brasília
    expect((await post('/api/departments', token, { name: 'Açougue', weeklyHoursTarget: 44 })).status).toBe(201);
    now = new Date('2026-12-15T03:30:00Z'); // 15/12/2026 00:30 em Brasília
    expect((await post('/api/departments', token, { name: 'Padaria', weeklyHoursTarget: 44 })).status).toBe(400);
  });
});

describe('três domingos seguidos com o histórico carregado pela API (item 4)', () => {
  it('GET da semana aponta SUNDAY_LAW e o gerador dá folga no 3º domingo', async () => {
    const { token } = await registerOwner();
    const dept = (await post('/api/departments', token, { name: 'Açougue', defaultSundayRule: 'CUSTOM' })).body.data;
    const shift = (await post('/api/shifts', token, { ...SHIFT, departmentId: dept.id })).body.data;
    const employee = (await post('/api/employees', token, { departmentId: dept.id, name: 'Ana' })).body.data;
    const weeks = ['2026-11-02', '2026-11-09', '2026-11-16'];
    for (const weekStartDate of weeks) {
      const res = await put('/api/schedules', token, { departmentId: dept.id, weekStartDate, assignments: weekCells(employee.id, shift.id, weekStartDate, 'OOWWWWW') });
      expect(res.status).toBe(200);
    }
    const res = await get(`/api/schedules?departmentId=${dept.id}&weekStart=${weeks[2]}`, token);
    const issue = res.body.data.validation.issues.find((i) => i.code === 'SUNDAY_LAW');
    expect(issue).toMatchObject({ severity: 'RED', employeeId: employee.id, date: '2026-11-22' });

    const generated = await post('/api/schedules/generate', token, { departmentId: dept.id, weekStartDate: weeks[2] });
    expect(generated.status).toBe(200);
    expect(generated.body.data.validation.issues.map((i) => i.code)).not.toContain('SUNDAY_LAW');
    expect(generated.body.data.assignments.find((a) => a.date === '2026-11-22').type).toBe('OFF');
  });
});

describe('exclusão de turno em uso (item 5)', () => {
  it('responde 409 SHIFT_IN_USE com a quantidade de células; sem uso, exclui', async () => {
    const { token } = await registerOwner();
    const dept = (await post('/api/departments', token, { name: 'Açougue' })).body.data;
    const shift = (await post('/api/shifts', token, { ...SHIFT, departmentId: dept.id })).body.data;
    const employee = (await post('/api/employees', token, { departmentId: dept.id, name: 'Ana' })).body.data;
    await put('/api/schedules', token, { departmentId: dept.id, weekStartDate: '2026-11-16', assignments: weekCells(employee.id, shift.id, '2026-11-16', 'WOWWWWO') });

    const blocked = await del(`/api/shifts/${shift.id}`, token);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('SHIFT_IN_USE');
    expect(blocked.body.error.details).toEqual({ assignmentCount: 5 });
    expect(blocked.body.error.message).toContain('5');
    expect((await get(`/api/shifts/${shift.id}`, token)).status).toBe(200);

    await put('/api/schedules', token, { departmentId: dept.id, weekStartDate: '2026-11-16', assignments: [] });
    expect((await del(`/api/shifts/${shift.id}`, token)).status).toBe(200);
    expect((await get(`/api/shifts/${shift.id}`, token)).status).toBe(404);
  });
});

describe('PATCH de ausência compara com o registro gravado (item 13)', () => {
  it('início depois do fim gravado (ou fim antes do início gravado) → 400', async () => {
    const { token } = await registerOwner();
    const dept = (await post('/api/departments', token, { name: 'Açougue' })).body.data;
    const employee = (await post('/api/employees', token, { departmentId: dept.id, name: 'Ana' })).body.data;
    const absence = (await post('/api/absences', token, { employeeId: employee.id, type: 'VACATION', startDate: '2026-11-20', endDate: '2026-11-25' })).body.data;
    const url = `/api/absences/${absence.id}`;
    expect((await patch(url, token, { startDate: '2026-11-30' })).status).toBe(400);
    expect((await patch(url, token, { endDate: '2026-11-19' })).status).toBe(400);
    const ok = await patch(url, token, { endDate: '2026-11-28' });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ startDate: '2026-11-20', endDate: '2026-11-28', type: 'VACATION' });
    expect((await patch(url, token, { startDate: '2026-11-28' })).status).toBe(200);
  });
});

describe('restrições de turno do funcionário (item 14)', () => {
  it('limita o tamanho de cada id e confere que é turno da organização', async () => {
    const a = await registerOwner('a@example.com');
    const b = await registerOwner('b@example.com');
    const dept = (await post('/api/departments', a.token, { name: 'Açougue' })).body.data;
    const shift = (await post('/api/shifts', a.token, { ...SHIFT, departmentId: dept.id })).body.data;
    const otherDept = (await post('/api/departments', b.token, { name: 'Padaria' })).body.data;
    const foreignShift = (await post('/api/shifts', b.token, { ...SHIFT, departmentId: otherDept.id })).body.data;
    const body = (ids) => ({ departmentId: dept.id, name: 'Ana', fixedConstraints: { unavailableShiftIds: ids } });

    expect((await post('/api/employees', a.token, body(['x'.repeat(65)]))).status).toBe(400);
    const foreign = await post('/api/employees', a.token, body([foreignShift.id]));
    expect(foreign.status).toBe(400);
    expect(JSON.stringify(foreign.body.error)).toContain(foreignShift.id);
    expect((await post('/api/employees', a.token, body(['inexistente']))).status).toBe(400);

    const ok = await post('/api/employees', a.token, body([shift.id]));
    expect(ok.status).toBe(201);
    expect(ok.body.data.fixedConstraints.unavailableShiftIds).toEqual([shift.id]);
    const url = `/api/employees/${ok.body.data.id}`;
    expect((await patch(url, a.token, { fixedConstraints: { unavailableShiftIds: [foreignShift.id] } })).status).toBe(400);
    expect((await patch(url, a.token, { fixedConstraints: { unavailableDays: ['SEG'] } })).status).toBe(200);
  });
});

describe('TRUST_PROXY (item 15)', () => {
  const silent = { logger: { info() {}, warn() {}, error() {} } };
  const trust = (value) => loadConfig({ NODE_ENV: 'test', TRUST_PROXY: value }, silent).trustProxy;

  it('aceita true/false e número inteiro de proxies', () => {
    expect(trust(undefined)).toBe(false);
    expect(trust('')).toBe(false);
    expect(trust('true')).toBe(true);
    expect(trust('TRUE')).toBe(true);
    expect(trust('false')).toBe(false);
    expect(trust('1')).toBe(1);
    expect(trust(' 2 ')).toBe(2);
    expect(trust('0')).toBe(0);
  });

  it('falha em valor inválido', () => {
    for (const value of ['sim', '1.5', '-1', 'loopback', '1e3x']) {
      expect(() => trust(value), value).toThrow(/TRUST_PROXY/);
    }
  });
});

describe('plano efetivo com assinatura irregular (item 7)', () => {
  it('assinatura PAST_DUE devolve FREE sem apagar o plano gravado', async () => {
    const { token, organization } = await registerOwner('a@example.com', 'LEADER_MONTHLY');
    await repositories.organizations.update(organization.id, { subscriptionStatus: 'PAST_DUE' });
    const me = await get('/api/auth/me', token);
    expect(me.body.data.organization.plan).toBe('FREE');
    expect((await repositories.organizations.get(organization.id)).plan).toBe('LEADER_MONTHLY');
    // Com mais de um setor bloqueado pelo FREE.
    expect((await post('/api/departments', token, { name: 'A' })).status).toBe(201);
    expect((await post('/api/departments', token, { name: 'B' })).status).toBe(403);
  });

  it('Passe Transição sem planExpiresAt é tratado como expirado e rebaixado', async () => {
    const { token, organization } = await registerOwner('a@example.com', 'TRANSITION_PASS');
    const me = await get('/api/auth/me', token);
    expect(me.body.data.organization.plan).toBe('FREE');
    expect((await repositories.organizations.get(organization.id)).plan).toBe('FREE');
  });
});
