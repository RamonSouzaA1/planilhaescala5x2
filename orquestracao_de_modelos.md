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

---

## 8. Próximas evoluções (planejadas, ainda não iniciadas)

Itens pedidos após a publicação do MVP no GitHub Pages. Entram na sequência de desenvolvimento depois das fatias F10 (revisão final) e F11 (README e acabamento).

### F12 — Wizard de primeiro uso (pulável)

* **Problema:** a tela inicial mostra muitos campos de uma vez (setor, equipe, turnos, cobertura, ausências), o que causa estranheza ao iniciar o planejamento.
* **Comportamento:** ao entrar pela primeira vez, oferecer um assistente em etapas curtas que guia o preenchimento do mínimo necessário para gerar a escala: (1) nome do setor e meta de horas; (2) cadastro da equipe (colar lista ou adicionar); (3) turnos padrão ou personalizados; (4) metas de cobertura simples; (5) gerar a primeira escala.
* **Regras:**
  * pode ser pulado a qualquer momento, com "Pular, eu sei fazer" sempre visível;
  * não reaparece depois de concluído ou pulado (marcador no store, persistido);
  * pode ser reaberto por um botão "Guia de configuração" no cabeçalho;
  * cada etapa mostra só os campos dessa etapa; os campos avançados (restrições individuais, regra de domingo própria, ciclo de domingo, convenção de intervalo) ficam recolhidos em "Opções avançadas".
* **Critério de pronto:** um usuário novo chega a uma escala gerada em até 5 etapas sem abrir nenhuma tela avançada; quem pula cai direto na grade sem perder dados já preenchidos.
* **Modelos sugeridos:** Sonnet para os componentes e a lógica de etapas; Opus para revisar que o wizard não contorna nenhuma regra de validação; Haiku para os textos.

### F13 — Escala mensal e visualização por mês

* **Geração do mês inteiro:** oferecer "Gerar mês" além de "Gerar semana". O gerador roda semana a semana, encadeando a semana anterior como entrada (virada de semana, OJ 410 e interjornada), preservando células travadas e ausências de cada semana.
* **Visualização mensal:** além da grade semanal, uma visualização por mês (calendário ou matriz compacta funcionário × dia do mês), com o semáforo CLT por célula e o total de alertas do mês.
* **Navegação:** alternância Semana / Mês no cabeçalho; ao trocar, a data selecionada é mantida.
* **Regras:**
  * a validação do mês usa a semana anterior ao primeiro dia do mês, como a semanal já faz;
  * meses que começam ou terminam no meio de uma semana mostram os dias fora do mês em cinza e não os geram;
  * exportação PNG mensal fica para uma etapa posterior, se houver demanda.
* **Critério de pronto:** gerar um mês de 26 funcionários continua abaixo de 1 segundo (ou com aviso de progresso), sem infrações vermelhas na loja exemplo.
* **Modelos sugeridos:** Opus para o encadeamento entre semanas do gerador (é regra de negócio); Sonnet para a visualização mensal; Haiku para textos e testes repetitivos.

---

## 9. Itens em aberto (revisão F10, não bloqueantes)

Registrados após a correção dos três bloqueantes (commit `96cc97b`). Ordenados por prioridade para o próximo ciclo.

**Antes de vender o Plano Loja ou de expor a API**
1. **Líder de setor sem escopo por setor** (ALTA, segurança): `SECTION_LEADER` consegue criar e alterar dados de outro setor da mesma organização. Correção: checar `user.departmentIds` em todas as rotas que recebem `departmentId`, no corpo, na query ou no recurso.
2. **Magic Link sem revogação e exposto** (MÉDIA, segurança/LGPD): não há rotação do token; o `accessToken` aparece para todos os papéis, inclusive HR_AUDITOR; a rota pública funciona em planos sem portal. Correção: rota de rotação, ocultar o token para quem não escreve e respeitar `allowEmployeePortal`.
3. **Teto legal de horas pela data** (MÉDIA, regra CLT): a meta aceita até 44h em qualquer data. Correção: teto de 42h a partir de 15/12/2026 (60 dias após a publicação da EC 141/2026, em 16/10/2026) e 40h 12 meses depois, calculado pela `weekStartDate`. A interface (`DepartmentSettings.jsx`) deve usar a mesma data.
4. **Domingo sem verificação para regra CUSTOM** (ALTA, regra CLT): quatro domingos seguidos trabalhados passam sem alerta. Correção: alerta vermelho por trabalhar três domingos seguidos (Lei 10.101/2000, art. 6º §1º), usando o histórico já carregado pela API.

**Qualidade e regras secundárias**
5. **Exclusão de turno em uso** (MÉDIA): células ficam sem turno e a validação fica verde. Correção: bloquear com 409 ou gerar alerta `MISSING_SHIFT`.
6. **Gerador prioriza restrições sobre a OJ 410** (MÉDIA): pode produzir sete dias seguidos quando há restrição de dia ou de domingo. Correção: reservar a folga obrigatória quando a sequência anterior já chega a 6 dias.
7. **Passe Transição sem data ou com assinatura cancelada** (MÉDIA, antes do webhook de pagamento): não expira sem `planExpiresAt` e ignora `subscriptionStatus`. Correção: tratar como expirado nesses casos.
8. **Hora noturna prorrogada** (BAIXA, regra CLT): a Súmula 60, II, não é computada.
9. **Trilha de auditoria** (MÉDIA, spec §7): não guarda o estado anterior e não há publicação da escala.

**LGPD e privacidade**
10. **Apagar dados e excluir conta** (MÉDIA): não há opção de apagar os dados do navegador, nem de excluir conta ou organização, nem texto de privacidade. Correção: ação de apagar dados locais, exclusão em cascata e política de retenção do IP no log de auditoria.
11. **Colar lista captura CPF como telefone** (BAIXA): qualquer sequência com dez dígitos vira telefone. Correção: exigir DDD válido e rejeitar padrão de CPF.

**Segurança e configuração**
12. **JWT de sete dias sem revogação** (BAIXA): correção com `tokenVersion` ou TTL curto com renovação.
13. **PATCH de ausência sem comparar com o registro gravado** (BAIXA): permite início depois do fim. Correção: mesclar com o registro antes da validação.
14. **Itens de restrição sem limite de tamanho e sem checagem de turno** (BAIXA): correção com limite por item e conferência de que o id é de um turno da organização.
15. **`TRUST_PROXY=true` vira `false` em silêncio** (BAIXA): o rate limit passa a contar o IP do proxy. Correção: aceitar `true` e falhar em valor inválido.

**Acabamento e infraestrutura**
16. **Sem tela de erro no front-end e sem migrations** (BAIXA): um `localStorage` corrompido pode deixar a tela branca; `api/prisma/` tem só o schema, então o deploy depende de `db push`. Correção: boundary com "limpar dados" e `prisma migrate` versionado.
17. **Front e API divergem na meta semanal** (BAIXA): o campo aceita 41,5h, mas a API aceita só inteiro. Correção: alinhar para inteiro.

**Não verificado sem banco real**
- Cascatas e a restrição `@@unique([employeeId, date])` do Prisma: mover um funcionário de setor e regravar a semana pode gerar erro P2002 sem tratamento. Só o repositório em memória foi testado.
- Criptografia em repouso e TLS dependem da hospedagem; o telefone é gravado como texto puro.
