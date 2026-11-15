import 'dotenv/config';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createMemoryRepositories } from './repositories/memory.js';

const config = loadConfig();

/** Escolhe a persistência: Prisma se DATABASE_URL existir; senão memória (dados somem ao reiniciar). */
async function buildRepositories() {
  if (!config.databaseUrl) {
    config.logger.warn('[db] DATABASE_URL não definida: usando repositórios EM MEMÓRIA (os dados somem ao reiniciar).');
    return { repositories: createMemoryRepositories(), close: async () => {} };
  }
  const { PrismaClient } = (await import('@prisma/client')).default;
  const { createPrismaRepositories } = await import('./repositories/prisma.js');
  const prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } });
  config.logger.info('[db] Usando PostgreSQL via Prisma.');
  return { repositories: createPrismaRepositories(prisma), close: () => prisma.$disconnect() };
}

const { repositories, close } = await buildRepositories();
const server = createApp({ repositories, config }).listen(config.port, () => {
  config.logger.info(`API ouvindo em http://localhost:${config.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(async () => {
      await close();
      process.exit(0);
    });
  });
}
