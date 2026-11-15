import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { loadConfig } from './config.js';
import { createMemoryRepositories } from './repositories/memory.js';
import { effectivePlan, requireAuth, tenantScope } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { authRoutes } from './routes/auth.js';
import { publicRoutes } from './routes/public.js';
import { resourceRoutes } from './routes/resources.js';
import { scheduleRoutes } from './routes/schedules.js';

/**
 * Cria o limitador de requisições com resposta no formato padrão de erro.
 * @param {number} windowMs
 * @param {number} limit
 */
function limiter(windowMs, limit) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Muitas requisições. Tente novamente em instantes.' } });
    },
  });
}

/**
 * Monta a aplicação Express. Os repositórios entram por injeção (Prisma em produção,
 * memória em testes/desenvolvimento).
 * @param {{ repositories?: import('./repositories/index.js').Repositories, config?: Partial<import('./config.js').AppConfig> }} [options]
 * @returns {import('express').Express}
 */
export function createApp({ repositories = createMemoryRepositories(), config: overrides = {} } = {}) {
  const quiet = { info() {}, warn() {}, error() {} };
  const base = loadConfig(process.env, { logger: quiet });
  const config = { ...base, ...overrides, rateLimit: { ...base.rateLimit, ...overrides.rateLimit } };
  const deps = { repositories, config };
  const app = express();

  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  app.use(helmet());
  app.use(
    cors({
      // Sem cabeçalho Origin (curl, servidor a servidor) passa; origem de navegador só se listada.
      origin: (origin, callback) => callback(null, !origin || config.corsOrigins.includes(origin)),
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  const { windowMs, authMax, publicMax } = config.rateLimit;
  app.use('/api/auth', limiter(windowMs, authMax), authRoutes(deps));
  app.use('/api/public', limiter(windowMs, publicMax), publicRoutes(deps));

  // Tudo abaixo exige login; o escopo de organização vem sempre do token.
  const guard = [requireAuth(deps), tenantScope, effectivePlan(deps)];
  const resources = resourceRoutes(deps);
  app.use('/api/departments', guard, resources.departments);
  app.use('/api/employees', guard, resources.employees);
  app.use('/api/shifts', guard, resources.shifts);
  app.use('/api/absences', guard, resources.absences);
  app.use('/api/schedules', guard, scheduleRoutes(deps));

  app.use(notFoundHandler);
  app.use(errorHandler(config));

  return app;
}
