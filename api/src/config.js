import { randomBytes } from 'node:crypto';

const DEV_CORS_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const MIN_SECRET_LENGTH = 32;
/** Prefixo do valor de exemplo do `.env.example`, que nunca deve ir para produção. */
const EXAMPLE_SECRET_PREFIX = 'troque-isto';

/**
 * @typedef {Object} AppConfig
 * @property {string} nodeEnv
 * @property {boolean} isProduction
 * @property {number} port
 * @property {string | undefined} databaseUrl
 * @property {string} jwtSecret
 * @property {string[]} corsOrigins
 * @property {string} publicAppUrl
 * @property {number | boolean} trustProxy
 * @property {{ windowMs: number, authMax: number, publicMax: number }} rateLimit
 * @property {{ info: Function, warn: Function, error: Function }} logger
 * @property {() => Date} now - relógio injetável (testes)
 */

/**
 * Lê e valida a configuração a partir das variáveis de ambiente.
 * Em produção, falha se JWT_SECRET faltar ou tiver menos de 32 caracteres.
 * Em desenvolvimento, usa um segredo efêmero aleatório (sessões caem ao reiniciar).
 * @param {Record<string, string | undefined>} [env=process.env]
 * @param {{ logger?: AppConfig['logger'] }} [options]
 * @returns {AppConfig}
 */
export function loadConfig(env = process.env, { logger = console } = {}) {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const quiet = nodeEnv === 'test';

  let jwtSecret = env.JWT_SECRET;
  if (isProduction) {
    if (!jwtSecret || jwtSecret.length < MIN_SECRET_LENGTH) {
      throw new Error(`JWT_SECRET é obrigatório em produção e deve ter ao menos ${MIN_SECRET_LENGTH} caracteres.`);
    }
    if (jwtSecret.startsWith(EXAMPLE_SECRET_PREFIX)) {
      throw new Error('JWT_SECRET ainda é o valor de exemplo do .env.example. Gere um segredo aleatório.');
    }
  } else if (!jwtSecret) {
    jwtSecret = randomBytes(48).toString('hex');
    if (!quiet) logger.warn('[config] JWT_SECRET ausente: usando segredo efêmero (as sessões caem ao reiniciar).');
  }

  const rawOrigins = (env.CORS_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  const corsOrigins = rawOrigins.length > 0 ? rawOrigins : isProduction ? [] : DEV_CORS_ORIGINS;
  if (isProduction && corsOrigins.length === 0) {
    logger.warn('[config] CORS_ORIGIN vazio em produção: nenhuma origem de navegador será aceita.');
  }

  const trustProxyRaw = env.TRUST_PROXY;
  const trustProxy = trustProxyRaw === undefined || trustProxyRaw === '' ? false : Number(trustProxyRaw) || false;

  return {
    nodeEnv,
    isProduction,
    port: Number(env.PORT) || 3001,
    databaseUrl: env.DATABASE_URL || undefined,
    jwtSecret,
    corsOrigins,
    publicAppUrl: (env.PUBLIC_APP_URL || 'https://planilhaescala5x2.com.br').replace(/\/+$/, ''),
    trustProxy,
    rateLimit: { windowMs: 15 * 60 * 1000, authMax: 20, publicMax: 60 },
    logger: quiet ? { info() {}, warn() {}, error() {} } : logger,
    now: () => new Date(),
  };
}
