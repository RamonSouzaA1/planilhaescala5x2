# Orquestração de Modelos e Subagentes — Planilha Escala 5x2 (MVP)

Guia operacional para construir o MVP com Claude Code + plugin ECC, distribuindo o trabalho entre **Opus 5.5**, **Fable**, **Sonnet 5.5** e **Haiku 5.5**. A especificação de produto continua sendo `especificacao_de_produto_planilha_escala_5x2.md`; este documento define **quem faz o quê, com qual modelo e com qual critério de pronto**.

---

## 1. Escopo do MVP (entrega de hoje)

**Dentro:**

* Fase 1 completa: equipe dinâmica ($N$ funcionários), turnos e cobertura, gerador 5x2, validador "Semáforo CLT", grade interativa com undo/redo, heatmap horário, exportação PNG/texto WhatsApp com marca d'água + QR Code no plano `FREE`, `planPermissions.js`.
* Esqueleto da API: Express (ES Modules) + Prisma/PostgreSQL com o schema completo, autenticação JWT, middleware multi-tenant por `organizationId` e rota pública do Magic Link (`/minha-escala/:token`) só leitura.

**Fora (backlog):** fluxo de trocas do portal, checkout Pix/assinaturas e webhooks, disparo via WhatsApp API, PDF A4 assinável, `.xlsx`, painel do Gerente Geral, indicação e rotas SEO.

---

## 2. Papéis dos modelos

| Modelo | Papel | Use para | Não use para |
| :--- | :--- | :--- | :--- |
| **Opus 5.5** | Orquestrador (sessão principal) e engenheiro de regras | Planejamento (`/ecc:plan`), `cltValidator.js`, `scheduleGenerator.js`, revisão das regras trabalhistas, integração entre fatias | Boilerplate, textos, tarefas mecânicas |
| **Fable** | Revisor sênior pontual | Revisão adversarial final (`/ecc:orch-review`), decisões de arquitetura difíceis, desempate quando Opus e um revisor discordam | Implementação do dia a dia (é o mais caro) |
| **Sonnet 5.5** | Implementador principal | Componentes React, store Zustand, rotas Express, schema Prisma, exportação PNG/texto | Algoritmo do gerador e regras CLT |
| **Haiku 5.5** | Executor mecânico | Scaffold, cópia de contratos da spec para código, testes repetitivos de UI, textos da interface, README, correções de lint | Qualquer decisão de regra de negócio |

> **Versão do Fable:** confirme com `/model` qual versão está disponível (o registro de modelos lista `claude-fable-5-1`). Nos subagentes, use o alias `fable`.

---

## 3. Plano de fatias

Cada fatia tem um único dono (modelo que escreve os arquivos) e um revisor (só leitura). A ordem respeita as dependências; fatias marcadas com ∥ podem rodar em paralelo.

| # | Fatia | Arquivos principais | Dono | Skill / Agente ECC | Revisor | Depende de |
| :-- | :--- | :--- | :--- | :--- | :--- | :--- |
| F0 | Scaffold do monorepo (Vite + React + Tailwind + Lucide; Express ESM; Vitest) | `web/`, `api/`, `shared/`, `package.json` | Haiku | `/ecc:orch-build-mvp` (scaffold) | Sonnet | — |
| F1 | Contratos JSDoc + feature flags | `shared/models/schemas.js`, `shared/utils/planPermissions.js` | Haiku | — | Opus | F0 |
| F2 | Validador "Semáforo CLT" (testes primeiro) | `shared/utils/cltValidator.js` + testes | **Opus** | `/ecc:tdd-workflow`, agente `ecc:tdd-guide` | Fable | F1 |
| F3 | Gerador 5x2 (testes primeiro) | `shared/utils/scheduleGenerator.js` + testes | **Opus** | `/ecc:tdd-workflow`, agente `ecc:tdd-guide` | Fable | F2 |
| F4 | Store: estado, undo/redo, persistência offline | `web/src/store/` | Sonnet | `ecc:frontend-patterns` | Opus | F1 |
| F5 ∥ | Equipe: CRUD, "Colar Lista", status, grupos de domingo, loja exemplo (26) | `web/src/features/team/` | Sonnet | `/ecc:react-test` | `ecc:react-reviewer` | F4 |
| F6 ∥ | Turnos e metas de cobertura (CRUD) | `web/src/features/shifts/` | Sonnet | `/ecc:react-test` | `ecc:react-reviewer` | F4 |
| F7 | Grade $N \times 7$: virtualização, pin, filtros, semáforo, heatmap | `web/src/features/grid/` | Sonnet | `ecc:frontend-patterns`, `ecc:react-performance` | Opus | F3, F5, F6 |
| F8 | Exportação PNG/texto WhatsApp + marca d'água + QR Code | `web/src/features/export/` | Sonnet | — | `ecc:react-reviewer` | F7 |
| F9 ∥ | API: Express + Prisma schema + JWT + multi-tenant + Magic Link leitura | `api/` | Sonnet | `ecc:api-design`, `ecc:prisma-patterns`, `ecc:backend-patterns` | `ecc:database-reviewer`, `ecc:security-reviewer` | F1 |
| F10 | Revisão final e segurança | todo o repositório | **Fable** | `/ecc:orch-review`, `/ecc:security-review` | Opus | F8, F9 |
| F11 | README, textos de interface, ajustes de lint | `README.md`, strings | Haiku | `ecc:doc-updater` | Sonnet | F10 |

**Decisão de estrutura:** `cltValidator.js`, `scheduleGenerator.js`, `planPermissions.js` e `schemas.js` ficam em `shared/` para que o front-end React e a API Express importem **o mesmo código** (exigência da spec para a pré-validação de trocas).

---

## 4. Como acionar cada modelo

* **Sessão principal:** `/model` → Opus 5.5. A sessão principal planeja, delega, integra e faz os commits.
* **Subagentes:** peça explicitamente o modelo na delegação, por exemplo: *"use um subagente Sonnet para implementar a fatia F5"*. O orquestrador passa `model: "sonnet" | "haiku" | "opus" | "fable"` ao criar o subagente.
* **Agentes ECC** (`ecc:react-reviewer`, `ecc:security-reviewer` etc.) usam o modelo definido no próprio agente, a menos que a delegação peça outro.

### Modelo de prompt de delegação

```
Fatia: F<n> — <nome>
Modelo: <sonnet|haiku|opus|fable>
Objetivo: <uma frase>
Arquivos que você pode criar/alterar: <lista> (não toque em mais nada)
Contratos a respeitar: shared/models/schemas.js, shared/utils/planPermissions.js
Referência: especificacao_de_produto_planilha_escala_5x2.md, seção <x>
Critério de pronto: <testes que precisam passar / comportamento visível>
Entregue: resumo das mudanças + comandos de teste executados e o resultado
```

---

## 5. Regras de orquestração

1. **Um escritor por arquivo.** Subagentes em paralelo (F5 ∥ F6 ∥ F9) nunca recebem arquivos em comum. Revisores são somente leitura.
2. **Regra de negócio é do Opus.** Nenhum subagente Sonnet/Haiku altera `cltValidator.js` ou `scheduleGenerator.js`; se precisar, devolve a necessidade ao orquestrador.
3. **Escalonamento.** Se um subagente falhar no critério de pronto duas vezes, a fatia sobe um nível: Haiku → Sonnet → Opus. Divergência entre Opus e revisor → Fable decide.
4. **Gate por fatia.** Uma fatia só é dada como pronta com: testes verdes (`vitest run`), build sem erro e revisão sem achado bloqueante. Em seguida, `/ecc:checkpoint` e commit.
5. **Contexto.** Antes de pausar ou trocar de sessão, `/ecc:save-session`; para retomar, `/ecc:resume-session`.

---

## 6. Critérios de aceite do núcleo (F2/F3)

Testes obrigatórios antes de qualquer UI depender do gerador:

* Todo funcionário ativo termina a semana com exatamente **5 dias `WORK` e 2 `OFF`** (descontadas ausências).
* Nenhuma sequência de **mais de 6 dias trabalhados**, inclusive na virada entre semanas (usa a semana anterior como entrada).
* **Interjornada ≥ 11h** entre o fim do turno em $D$ e o início em $D+1$.
* Rodízio de domingo `1_IN_3` e `1_IN_2` respeitado; grupos com $\lfloor N/3 \rfloor$ ou $\lceil N/3 \rceil$ pessoas.
* **Descanso semanal ≥ 35h** quando há folga entre dois turnos (Súmula 110 TST: 24h + 11h).
* **Intrajornada** (art. 71 CLT): acima de 6h de trabalho, 1h (ou 30 min com convenção, via `department.minBreakMinutes`); de 4h a 6h, 15 min.
* **Jornada diária ≤ 10h** (art. 59 CLT) e carga semanal contando a **hora noturna reduzida** (art. 73 CLT, 22h–05h a 52min30s).
* Atestado/banco de horas ocupam dias de trabalho (as 2 folgas continuam devidas); semanas com férias exigem só ≤ 5 dias de trabalho. *Interpretação a validar com advogado.*
* Células `isPinned`, férias/atestados e `fixedConstraints` nunca são sobrescritas.
* Folgas concentradas de segunda a quarta; cobertura de sexta a domingo maximizada.
* Casos de borda: $N = 1$, $N = 3$, $N = 26$, $N = 200$ (desempenho: gerar em < 1s).

---

## 7. Referências legais verificadas (base do `cltValidator.js`)

* **OJ 410 da SDI-1/TST:** repouso semanal concedido após o 7º dia consecutivo de trabalho viola o art. 7º, XV, da CF e é devido em dobro, mesmo com folga compensatória posterior ou norma coletiva em contrário. Fundamenta a regra "máximo de 6 dias seguidos, inclusive na virada de semana".
* **EC 141/2026** (promulgada em 16/10/2026): fim da escala 6x1, dois dias de repouso semanal remunerado (um preferencialmente aos domingos) e redução da jornada em duas etapas — **42h semanais** a partir de 60 dias da publicação (dez/2026) e **40h** 12 meses depois (dez/2027). Convenção ou acordo coletivo pode redistribuir a carga diária, respeitados os dois dias de descanso.
* Antes do lançamento comercial, validar os textos de alerta da interface com um advogado trabalhista.
