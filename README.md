# Planilha Escala 5x2

Monorepo npm workspaces (100% JavaScript, ES Modules).

## Instalação

```bash
npm install
```

## Comandos

- `npm run dev`: sobe o web (Vite, porta 5173, com proxy de `/api`) e a api (Express, porta 3001) juntos.
- `npm test`: roda os testes de `shared` (node), `api` (node) e `web` (jsdom) via Vitest.
- `npm run build`: build de produção do `web`.

A api lê as variáveis de `api/.env` (modelo em `api/.env.example`).

## Estrutura

```
.
├── package.json          # workspaces e scripts da raiz
├── vitest.config.js      # projetos de teste: web (jsdom), shared e api (node)
├── shared/               # @escala/shared: models/ e utils/ compartilhados
├── web/                  # frontend Vite + React (.jsx) + Tailwind + Lucide
│   └── src/
│       ├── store/        # estado global (Zustand)
│       └── features/     # team, shifts, grid, export
└── api/                  # backend Express (ESM)
    └── src/              # app.js (createApp) e server.js (listen)
```
