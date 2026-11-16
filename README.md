# Planilha Escala 5x2

Ferramenta para chefes de seção e gerentes de loja do varejo montarem a escala semanal da equipe no regime 5x2, com a validação das regras da CLT em tempo real e exportação do resumo para o WhatsApp.

Site (somente front-end): https://ramonsouzaa1.github.io/planilhaescala5x2/

> O site publicado é só o front-end. Ele não tem API nem login, e os dados ficam salvos no navegador de quem usa (localStorage). Trocar de navegador ou de computador significa começar do zero.

## Estado atual

Versão MVP. O que existe hoje:

- **Grade semanal** com edição por célula, desfazer/refazer e geração automática da escala.
- **Validador CLT** que marca em vermelho ou amarelo as infrações e os alertas, em tempo real.
- **Equipe**: cadastro de colaboradores, colagem de lista, ausências e regra de domingo por pessoa.
- **Turnos e cobertura**: turnos padrão ou personalizados, metas de cobertura por dia e heatmap de cobertura.
- **Exportação**: imagem PNG da grade e resumo da semana para colar ou abrir no WhatsApp.
- **Paywall visual**: a tela de planos aparece, mas o pagamento ainda não é possível.

Ainda **não estão prontos**:

- checkout Pix (hoje a tela informa que o pagamento ainda não está disponível e não cobra nada);
- envio automático pelo WhatsApp (hoje o usuário confirma o envio manualmente);
- escala mensal e visualização por mês;
- wizard de primeiro uso.

O backlog com as próximas evoluções e os itens em aberto está em `orquestracao_de_modelos.md` (seções 8 e 9).

## Como rodar localmente

Pré-requisitos: Node.js 22 ou superior e npm.

```bash
npm install
npm run dev     # sobe o web (http://localhost:5173) e a api (http://localhost:3001)
npm test        # testes de shared, api e web (Vitest)
npm run build   # build de produção do web, em web/dist
```

O web faz proxy de `/api` para a porta 3001, então `npm run dev` é suficiente para testar o front e a api juntos.

## API (Express + Prisma)

A api é um backend em desenvolvimento. O site publicado não a utiliza.

Configuração: copie `api/.env.example` para `api/.env` e ajuste os valores. O arquivo `.env` está no `.gitignore` e não deve ser versionado.

- **Sem `DATABASE_URL`**: a api usa repositórios **em memória**. Os dados somem ao reiniciar. Serve para desenvolvimento e testes.
- **Com `DATABASE_URL`** (PostgreSQL): a api usa o Prisma. O schema está em `api/prisma/schema.prisma`.
- **`JWT_SECRET`**: em `NODE_ENV=production` é obrigatório e precisa ter 32 caracteres ou mais; sem isso a api não sobe. Em desenvolvimento, se ficar vazio, a api gera um segredo aleatório (as sessões caem ao reiniciar). **Nunca use o valor de exemplo do `.env.example` em produção.** Gere um novo com o comando indicado no próprio arquivo.
- `CORS_ORIGIN`, `PUBLIC_APP_URL` e `TRUST_PROXY` controlam as origens permitidas, o link de acesso e o IP visto pelo limite de requisições atrás de proxy reverso.

## Estrutura do repositório

Monorepo com npm workspaces, 100% JavaScript (ES Modules).

```
.
├── package.json          # workspaces e scripts da raiz
├── vitest.config.js      # projetos de teste: web (jsdom), shared e api (node)
├── shared/               # @escala/shared: regras puras usadas por web e api
│   ├── models/           # validação de dados (schemas)
│   └── utils/            # validador CLT, gerador de escala, rodízio de domingo, datas, planos
├── web/                  # frontend Vite + React (.jsx) + Tailwind + Lucide
│   └── src/
│       ├── store/        # estado global (Zustand) com persistência em localStorage
│       └── features/     # team, shifts, grid, export
└── api/                  # backend Express + Prisma (ESM)
    ├── prisma/           # schema do banco
    └── src/              # app.js (createApp), server.js (listen), rotas, repositórios
```

**Por que existe o `shared`:** as regras de negócio (validador CLT, gerador, rodízio de domingo, datas e permissões por plano) precisam dar o mesmo resultado no navegador e no servidor. Por isso ficam em um pacote próprio, sem dependência de React, Express ou banco de dados. Assim a regra é escrita uma vez e testada uma vez.

## Regras de negócio

O validador checa a escala com estes parâmetros:

- **Regime 5x2**: 5 dias de trabalho e 2 de folga por semana.
- **Interjornada**: mínimo de 11 horas entre o fim de um turno e o início do próximo.
- **Descanso semanal**: mínimo de 35 horas seguidas de descanso por semana.
- **Intervalo intrajornada**: turno acima de 6 horas exige intervalo de 60 minutos (configurável entre 30 e 60 por setor); acima de 4 horas, 15 minutos.
- **Jornada diária**: máximo de 10 horas por dia.
- **Dias seguidos**: máximo de 6 dias de trabalho seguidos.
- **Rodízio de domingo**: 1 em cada 3 domingos por padrão, ou 1 em 2 como opção. A regra individual do colaborador prevalece sobre a do setor.
- **Carga semanal (EC 141/2026)**: meta de 42 horas semanais a partir de dez/2026 e de 40 horas a partir de dez/2027, configurável por setor.

> **Aviso:** o validador é um auxílio para planejar a escala. Ele não substitui a assessoria jurídica nem a análise do departamento pessoal. Convenções coletivas e acordos específicos podem trazer regras diferentes das acima.

Limitações conhecidas (com a correção prevista no backlog, seção 9): o teto de horas ainda não muda automaticamente pela data, e a regra de domingo personalizada ainda não alerta sobre três domingos seguidos.

## Deploy

O workflow `.github/workflows/pages.yml` roda a cada push nas branches `master` ou `main` (e manualmente). Ele instala as dependências com `npm ci`, roda `npm test`, gera o build do web e publica `web/dist` no GitHub Pages. O build não passa se algum teste falhar.

## Licença

A definir.

> TODO: escolher a licença antes de tornar o código público ou aceitar contribuições. Até lá, nenhuma licença de uso, cópia ou redistribuição está concedida.
