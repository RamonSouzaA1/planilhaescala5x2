# Especificação Completa de Produto e Arquitetura (PRD): Planilha Escala 5x2 (Stack 100% JavaScript)

## 1. Visão do Produto e Posicionamento

* **Nome do Produto:** Planilha Escala 5x2
* **Domínio Principal:** `planilhaescala5x2.com.br` *(recomendação: registrar também `planilhaescala5x2.app.br` com redirecionamento 301 para proteção de marca)*
* **Categoria:** SaaS B2B *Vertical* para Varejo e Supermercados (*Workforce Management* com interface familiar de planilha inteligente)
* **Contexto Regulatório:** Transição da jornada 6x1 para 5x2 no varejo brasileiro (adequação à Emenda Constitucional 141/2026, promulgada em 16/10/2026 — dois dias de repouso semanal remunerado, um preferencialmente aos domingos, e redução da jornada para $42\text{h}$ semanais a partir de dez/2026 e $40\text{h}$ a partir de dez/2027, além das regras vigentes da CLT, da OJ 410 da SDI-1/TST e das convenções coletivas do comércio).
* **Visão:** Ser a ferramenta padrão de organização de turnos do varejo brasileiro, unindo a familiaridade visual de uma planilha de horários com a inteligência de um motor trabalhista automático e adoção *bottom-up* (começando pelo chefe de seção na ponta e escalando para toda a rede de lojas).
* **Pilares de Diferenciação:**
  1. **Familiaridade de Planilha + Inteligência de Sistema:** Elimina a curva de aprendizado de softwares complexos de RH. O líder enxerga uma grade limpa estilo planilha, mas o sistema preenche folgas, calcula horas e bloqueia falhas automaticamente.
  2. **Escalabilidade Dinâmica ($N$ Funcionários e Multi-Unidade):** Suporta desde uma única seção com $N$ colaboradores até redes com dezenas de lojas e centenas de funcionários, recalculando capacidade e cobertura automaticamente.
  3. **Adoção Sem Atrito (*Zero-App* para a Equipe):** O gestor opera em painel completo (Web/PWA); os colaboradores acessam sua escala e solicitam trocas via *Magic Link* no WhatsApp, sem precisar baixar aplicativos ou criar senhas.
  4. **Motor Inteligente de Escala 5x2:** Algoritmo de otimização por restrições que distribui folgas semanais, garante rodízio de domingos, respeita dias consecutivos máximos entre semanas e cobre picos de movimento por faixa horária.
  5. **Blindagem Trabalhista ("Semáforo CLT & Sindical") & Operação *WhatsApp-First*:** Auditoria preventiva em tempo real de interjornada ($11\text{h}$), intrajornada, limite de dias consecutivos trabalhados, carga horária semanal ($42\text{h}/40\text{h}$), regras de domingo e disparo automatizado no WhatsApp.

---

## 2. Roadmap de Evolução do Produto

O projeto é estruturado em três fases incrementais de entrega:

* **Fase 1 — Core Operacional (Single-Player & PWA em React `.jsx`):**
  * Gestão dinâmica de $N$ funcionários, turnos e metas de cobertura em grade estilo planilha interativa.
  * Gerador automático de escala 5x2 com rodízio de domingos e validação CLT em tempo real.
  * Grade com busca, filtros, desfazer/refazer e exportação em PNG/Texto para WhatsApp (com marca d'água e QR Code de `planilhaescala5x2.com.br` no plano gratuito).
* **Fase 2 — API Node.js/Express, Banco de Dados e Portal do Colaborador:**
  * Backend RESTful em Node.js + Express, banco PostgreSQL e suporte a múltiplas seções/lojas.
  * Gestão de férias, atestados, banco de horas e restrições individuais (ex.: estudante noturno).
  * Portal do Colaborador via link único (visualização de escala e solicitação de troca de folga/turno com pré-validação CLT).
* **Fase 3 — Monetização Instantânea (Pix/Assinaturas), Automação WhatsApp e Inteligência:**
  * *Paywall* no "Momento Aha!", *feature flags* por plano, checkout via Pix avulso (*Passe Transição*) e assinaturas recorrentes com webhooks.
  * Painel consolidado do Gerente Geral da Loja, mapa de calor de cobertura hora a hora e disparo automático via WhatsApp API.
  * Relatórios de auditoria jurídica (PDF A4 assinável), exportação Excel para ponto/folha e programa de indicação viral entre líderes.

---

## 3. Arquitetura Tecnológica (100% JavaScript)

Toda a aplicação utiliza **JavaScript puro (ES2023+)** sem etapa de compilação TypeScript, garantindo velocidade de prototipação e compatibilidade direta entre front-end e back-end:

* **Frontend & PWA (React `.jsx`):**
  * **React 18+ (`.jsx`) + Vite + Tailwind CSS + Lucide React.**
  * **Gerenciamento de Estado:** Zustand (`.js`) ou React Context + `useReducer` para histórico de Desfazer/Refazer (*Undo/Redo*).
  * **PWA *Offline-First*:** Service Workers + `IndexedDB` / `localStorage` para operação contínua mesmo em estoques e câmaras frias sem sinal de internet.
  * **Virtualização de Listas:** `@tanstack/react-virtual` para renderização fluida de grades com $N > 100$ funcionários.
* **Backend & API REST (Node.js + Express `.js`):**
  * **Runtime & Framework:** Node.js + Express.js (ES Modules `"type": "module"`).
  * **Banco de Dados & ORM:** PostgreSQL com **Prisma ORM** (`@prisma/client` em JavaScript puro) ou **Knex.js**.
  * **Validação & Segurança:** Validação de entrada nas rotas Express com `zod` (em `.js`), autenticação via JWT (`jsonwebtoken`) e *Magic Links* temporários, isolamento multi-tenant por `organizationId` em middlewares Express, `helmet` e `cors`.
* **Integrações Externas (SDKs Node.js / JS):**
  * **Pagamentos (Pix Avulso & Assinaturas):** AbacatePay, Asaas ou Mercado Pago (SDK oficial Node.js) para geração de QR Code Pix instantâneo e assinatura recorrente via cartão/Pix Automático.
  * **WhatsApp:** WhatsApp Cloud API (Meta) ou gateway (Evolution API / Z-API) via `axios`/`fetch` no Express.
  * **Exportação & QR Code:** `html-to-image` (PNG para WhatsApp no front-end), `qrcode` (geração de QR Code viral apontando para `https://planilhaescala5x2.com.br` nos PDFs gratuitos), `jspdf` / `pdfkit` (PDF A4 para mural e auditoria) e `xlsx` (planilha Excel para RH).

---

## 4. Modelo de Dados e Contratos de Objeto (JavaScript / JSDoc)

Para manter a consistência entre o front-end React (`.jsx`) e o back-end Express (`.js`) sem usar TypeScript, utilize os contratos JSDoc abaixo como padrão nos arquivos `models/schemas.js`:

```javascript
/**
 * @typedef {'FREE' | 'LEADER_MONTHLY' | 'TRANSITION_PASS' | 'STORE_MULTI' | 'ENTERPRISE'} PlanType
 * @typedef {'ACTIVE' | 'EXPIRED' | 'PAST_DUE' | 'CANCELED'} SubscriptionStatus
 * @typedef {'OWNER' | 'STORE_MANAGER' | 'SECTION_LEADER' | 'HR_AUDITOR'} UserRole
 * @typedef {'SEG' | 'TER' | 'QUA' | 'QUI' | 'SEX' | 'SAB' | 'DOM'} DayOfWeek
 * @typedef {'ACTIVE' | 'VACATION' | 'MEDICAL_LEAVE' | 'INACTIVE'} EmployeeStatus
 * @typedef {'WORK' | 'OFF' | 'ABSENCE'} AssignmentType
 */

/**
 * --- HIERARQUIA MULTI-TENANT E ASSINATURA ---
 * @typedef {Object} Organization
 * @property {string} id
 * @property {string} name - Ex: "Supermercados Modelo Ltda" ou "Açougue Loja 01"
 * @property {string} [cnpj] - Opcional (permite cadastro sem CNPJ para chefes de seção)
 * @property {PlanType} plan
 * @property {SubscriptionStatus} subscriptionStatus
 * @property {string} [planExpiresAt] - ISO Date (obrigatório para TRANSITION_PASS de 45 dias)
 * @property {string} [gatewayCustomerId] - ID no Asaas / Mercado Pago / AbacatePay
 * @property {string} [gatewaySubscriptionId]
 * @property {string} referralCode - Código único para indicar outros líderes da loja
 * @property {string} [referredByCode]
 * @property {number} bonusDaysAccumulated - Dias grátis ganhos por indicação
 * @property {string} createdAt
 */

/**
 * @typedef {Object} PaymentTransaction
 * @property {string} id
 * @property {string} organizationId
 * @property {'ABACATEPAY' | 'ASAAS' | 'MERCADOPAGO'} gateway
 * @property {string} externalId - ID da cobrança no gateway
 * @property {PlanType} planPurchased
 * @property {'MONTHLY' | 'YEARLY' | 'ONE_TIME_45D'} billingCycle
 * @property {number} amountCents - Ex: 3990 (R$ 39,90) ou 5990 (R$ 59,90)
 * @property {'PIX' | 'CREDIT_CARD'} paymentMethod
 * @property {'PENDING' | 'PAID' | 'EXPIRED' | 'REFUNDED'} status
 * @property {string} [pixQrCode]
 * @property {string} [pixCopyPaste]
 * @property {string} [paidAt]
 * @property {string} createdAt
 */

/**
 * @typedef {Object} Store
 * @property {string} id
 * @property {string} organizationId
 * @property {string} name - Ex: "Loja 01 - Centro"
 * @property {string} [logoUrl] - Desbloqueado no Plano Loja (STORE_MULTI)
 * @property {string} city
 * @property {string} state
 */

/**
 * @typedef {Object} Department
 * @property {string} id
 * @property {string} storeId
 * @property {string} name - Ex: "Açougue", "Frente de Caixa", "Hortifruti"
 * @property {'1_IN_3' | '1_IN_2' | 'CUSTOM'} defaultSundayRule
 * @property {number} weeklyHoursTarget - Ex: 42 (EC 141/2026) ou 40
 */

/**
 * @typedef {Object} UserAccount
 * @property {string} id
 * @property {string} organizationId
 * @property {string} name
 * @property {string} email
 * @property {string} [phone]
 * @property {UserRole} role
 * @property {string[]} departmentIds
 */

/**
 * --- CONFIGURAÇÃO OPERACIONAL ---
 * @typedef {Object} ShiftTemplate
 * @property {string} id
 * @property {string} departmentId
 * @property {string} name - Ex: "Abertura", "Intermediário", "Fechamento"
 * @property {string} code - Ex: "T1", "T2", "T3"
 * @property {string} startTime - Ex: "07:00"
 * @property {string} endTime - Ex: "16:24"
 * @property {number} breakDurationMinutes - Intrajornada (ex: 60 ou 120)
 * @property {string} color - Hexadecimal (ex: "#2563EB")
 * @property {boolean} isNightShift - Adicional noturno (22h às 05h)
 */

/**
 * @typedef {Object} CoverageRule
 * @property {string} id
 * @property {string} departmentId
 * @property {DayOfWeek} dayOfWeek
 * @property {number} minTotalStaff
 * @property {Array<{ tag: string, minCount: number }>} requiredTags
 * @property {Array<{ start: string, end: string, minStaff: number }>} [peakHours]
 */

/**
 * --- EQUIPE DINÂMICA (N FUNCIONÁRIOS) ---
 * @typedef {Object} Employee
 * @property {string} id
 * @property {string} departmentId
 * @property {string} name
 * @property {string} [phone]
 * @property {string} accessToken - Token único para acesso sem senha ao portal
 * @property {string} roleTitle - Ex: "Açougueiro", "Operador de Caixa"
 * @property {string[]} tags - Ex: ["Abertura", "Fechamento", "Líder", "Serra"]
 * @property {1 | 2 | 3} sundayGroup - Grupo dinâmico para rodízio de domingo
 * @property {'1_IN_2' | '1_IN_3'} [customSundayRule]
 * @property {{ unavailableDays?: DayOfWeek[], unavailableShiftIds?: string[] }} [fixedConstraints]
 * @property {EmployeeStatus} status
 * @property {string} createdAt
 */

/**
 * @typedef {Object} Absence
 * @property {string} id
 * @property {string} employeeId
 * @property {'VACATION' | 'MEDICAL' | 'COMP_TIME' | 'OTHER'} type
 * @property {string} startDate - YYYY-MM-DD
 * @property {string} endDate - YYYY-MM-DD
 * @property {string} [notes]
 */

/**
 * --- ESCALAS, TROCAS E AUDITORIA ---
 * @typedef {Object} ScheduleCycle
 * @property {string} id
 * @property {string} departmentId
 * @property {string} weekStartDate - Segunda-feira da semana (YYYY-MM-DD)
 * @property {1 | 2 | 3} cycleWeek
 * @property {'DRAFT' | 'PUBLISHED' | 'ARCHIVED'} status
 * @property {string} [publishedAt]
 * @property {string} [publishedBy]
 */

/**
 * @typedef {Object} DailyAssignment
 * @property {string} id
 * @property {string} scheduleCycleId
 * @property {string} employeeId
 * @property {string} date - YYYY-MM-DD
 * @property {DayOfWeek} dayOfWeek
 * @property {AssignmentType} type
 * @property {string} [shiftId]
 * @property {boolean} isPinned
 */

/**
 * @typedef {Object} ShiftSwapRequest
 * @property {string} id
 * @property {string} departmentId
 * @property {string} requesterId
 * @property {string} targetEmployeeId
 * @property {string} date
 * @property {string} [requesterShiftId]
 * @property {string} [targetShiftId]
 * @property {boolean} cltValidationPassed
 * @property {string[]} cltWarnings
 * @property {'PENDING_PEER' | 'PENDING_MANAGER' | 'APPROVED' | 'REJECTED'} status
 * @property {string} [reviewedBy]
 * @property {string} createdAt
 */

/**
 * @typedef {Object} AuditLog
 * @property {string} id
 * @property {string} departmentId
 * @property {string} userId
 * @property {string} action - Ex: "ALTEROU_TURNO", "PUBLICOU_ESCALA", "APROVOU_TROCA", "UPGRADE_PLANO"
 * @property {string} details
 * @property {string} timestamp
 */
```

---

## 5. Módulos Funcionais do Sistema Completo

### Módulo 1: Gestão Multi-Loja e Multi-Seção

* **Visão do Líder de Seção:** Acesso direto à sua equipe de $N$ funcionários (ex.: Açougue com 26 pessoas, Frente de Caixa com 42 pessoas).
* **Visão do Gerente Geral da Loja:** Painel consolidado exibindo a saúde de todas as seções da unidade (total de ativos, pessoas de folga hoje, alertas trabalhistas pendentes e empréstimo temporário de funcionários entre seções).

### Módulo 2: Gestão Dinâmica da Equipe ($N$ Funcionários) e Ausências

* **Escalabilidade Ilimitada ($N$):** Adição individual, edição em massa, importação via planilha (`.xlsx`/`.csv`) ou colagem de lista de texto do WhatsApp.
* **Redistribuição Inteligente de Rodízio:** Ao incluir ou afastar colaboradores, o sistema recalcula os grupos de domingo via aritmética modular ($i \pmod 3 + 1$), mantendo $\lfloor N/3 \rfloor$ ou $\lceil N/3 \rceil$ colaboradores por grupo.
* **Calendário de Férias e Atestados:** Ao lançar férias ou atestado médico para um colaborador, o sistema bloqueia automaticamente os dias correspondentes na grade e recalcula a capacidade disponível ($\approx \frac{5}{7} \times N_{\text{ativos}}$), alertando se for necessário remanejar folgas da equipe.
* **Restrições Individuais:** Permite cadastrar bloqueios fixos (ex.: *"Carlos não pode fazer fechamento às terças e quintas por motivo de estudo"*), respeitados automaticamente pelo gerador.

### Módulo 3: Motor Gerador 5x2 Avançado (Otimizador por Restrições)

Ao clicar em **"Gerar Escala Inteligente"**, o motor em JavaScript puro (`utils/scheduleGenerator.js`) executa um algoritmo em 4 etapas para todos os $N$ colaboradores ativos:

1. **Respeito às Travas e Ausências:** Mantém intactas as células marcadas como `isPinned` pelo gestor, férias/atestados e restrições individuais.
2. **Alocação de Domingos e Controle Inter-Semanas:**
   * Aplica o rodízio configurado (`1 em 3 semanas` ou `1 em 2 semanas`).
   * **Regra Crítica de Transição Semanal (OJ 410 TST):** Verifica os últimos dias trabalhados na semana anterior para impedir que a combinação de folgas faça alguém trabalhar mais de $6$ dias seguidos na virada de uma semana para outra.
3. **Distribuição Estratégica das Folgas:**
   * Garante exatamente $5$ dias de trabalho e $2$ folgas na semana ($2N$ folgas totais).
   * Concentra a maior parte das folgas entre **Segunda e Quarta-feira**, maximizando a equipe disponível de **Sexta a Domingo** (e em dias marcados como `PEAK` no calendário de feriados).
4. **Balanceamento de Turnos e Habilidades (*Tags*):**
   * Distribui os colaboradores entre `Abertura`, `Intermediário` e `Fechamento` garantindo a cobertura mínima de *tags* críticas (ex.: pelo menos $1$ `Líder` e $1$ `Operador de Serra` por turno) sem violar o descanso mínimo de $11\text{h}$ entre jornadas.

### Módulo 4: Auditoria Trabalhista em Tempo Real ("Semáforo CLT & Sindical")

Cada alteração manual ou automática passa pelo validador (`utils/cltValidator.js`), exibindo alertas visuais imediatos:

* **Bloqueio / Infração Grave (Vermelho):**
  * **Interjornada $< 11\text{h}$:** Intervalo entre o fim do turno do dia $D$ e o início do turno do dia $D+1$ inferior a $11$ horas.
  * **Mais de $6$ dias seguidos trabalhados:** Violação do Descanso Semanal Remunerado (DSR) ao cruzar semanas.
  * **Descumprimento do modelo 5x2:** Colaborador com menos ou mais de $2$ folgas na semana (alerta de geração de hora extra ou déficit de jornada).
  * **Conflito com Férias/Atestado:** Tentativa de escalar colaborador afastado.
* **Alerta Operacional / Sindical (Amarelo):**
  * **Furo de Cobertura:** Total de pessoas no dia ou no horário de pico abaixo da meta mínima configurada.
  * **Falta de Especialidade:** Turno sem nenhum colaborador com uma *tag* obrigatória (ex.: sem ninguém habilitado para fechar o caixa).
  * **Quebra de Rodízio de Domingo:** Colaborador escalado no domingo em que deveria folgar pelo ciclo.

### Módulo 5: Grade Interativa + Mapa de Calor Horário

* **Matriz Responsiva ($N \times 7$):** Visual familiar de planilha de turnos com cabeçalho e coluna de nomes fixos, busca instantânea, filtros por turno/*tag*/alerta, histórico de Desfazer/Refazer (`Ctrl+Z`), duplicação da semana anterior e opção de "Travar Célula" (*Pin*).
* **Linha de Cobertura Horária (Heatmap):** Além da contagem total por dia (`Trabalhando: X | Folga: Y`), uma barra expansível mostra quantas pessoas estarão ativas na loja a cada hora do dia (ex.: `07h: 6 | 10h: 12 | 14h: 18 | 19h: 14 | 22h: 6`), permitindo identificar gargalos no horário de almoço ou pico noturno.

### Módulo 6: Portal do Colaborador (*Zero-App*) e Fluxo de Trocas

* **Acesso via Magic Link:** Cada funcionário possui uma URL exclusiva (`planilhaescala5x2.com.br/minha-escala/:token`, enviada via WhatsApp) que abre uma tela leve no celular mostrando apenas:
  * Seus turnos e dias de folga da semana atual e da próxima.
  * Contagem regressiva para seu próximo domingo de folga.
* **Autoatendimento de Troca de Turno/Folga:**
  * O funcionário seleciona um colega e propõe trocar um dia de folga ou turno.
  * **Pré-validação Instantânea:** O back-end Node.js roda o mesmo motor `cltValidator.js` para verificar se a troca gera infração de interjornada ($< 11\text{h}$) ou deixa alguma *tag* crítica descoberta. Se violar a CLT, o sistema bloqueia a proposta antes mesmo de incomodar o chefe de seção.
  * Se válida, o colega aceita pelo link e o gestor recebe um botão de **"Aprovar Troca em 1 Clique"** no WhatsApp/Painel.

### Módulo 7: Comunicação *WhatsApp-First* e Relatórios

* **Publicação Oficial:** Ao mudar o status da escala de `Rascunho` para `Publicada`, a API Express registra o histórico imutável (auditoria trabalhista) e libera os disparos:
  * **Disparo Individual Automático:** Envia mensagem personalizada no WhatsApp de cada um dos $N$ funcionários com seus horários e folgas da semana + link do portal.
  * **Imagem PNG da Grade Completa:** Renderiza tabela de alta legibilidade ajustada dinamicamente para qualquer quantidade $N$ de linhas.
  * **PDF Assinável para Mural / RH:** Documento formal com cabeçalho da loja, semana de vigência e campo de ciência, além de exportação `.xlsx` para integração com folha/ponto.

---

## 6. Estratégia de Monetização, *Feature Flags* e Fluxo de Checkout Pix

### 6.1 Tabela de Planos e Posicionamento Competitivo

Desenhada para capturar tanto o chefe de seção que paga do próprio bolso (*bottom-up*) quanto o gerente geral da loja, cobrindo o vácuo de preço do mercado entre R$ 30 e R$ 120/mês:

| Plano (`PlanType`) | Preço | Limites e Recursos | Público-Alvo |
| :--- | :--- | :--- | :--- |
| **Gratuito (`FREE`)** | **R$ 0 / mês** | • Até **$N = 10$ funcionários** em 1 seção<br>• Montagem manual + 1 simulação automática 5x2<br>• Alertas básicos de CLT<br>• Exportação PDF/PNG com marca d'água e QR Code viral | Pequenos comércios e encarregados testando a ferramenta. |
| **Plano Líder (`LEADER_MONTHLY`)** *(Carro-chefe)* | **R$ 39,90 / mês**<br>*(ou R$ 349,00/ano)* | • **$N$ funcionários ilimitados** em 1 seção<br>• Gerador Automático 5x2 (regras $42\text{h}$ e $40\text{h}$)<br>• Validador Semáforo CLT completo + *Tags* de posto<br>• Exportação limpa (Mural A4 + Card individual WhatsApp)<br>• Histórico de semanas anteriores | **Chefes de seção** (Frente de Caixa, Açougue, Padaria, Hortifrúti) com 15 a 50+ pessoas. |
| **Passe Transição (`TRANSITION_PASS`)** *(Pagamento Único)* | **R$ 59,90**<br>*(Pix — 45 dias)* | • Todos os recursos do *Plano Líder* por **45 dias corridos**<br>• Sem renovação automática e sem cartão de crédito | Gestores com aversão a mensalidades que precisam resolver a migração 6x1 $\rightarrow$ 5x2 imediatamente. |
| **Plano Loja (`STORE_MULTI`)** | **R$ 119,00 / mês**<br>*(ou R$ 1.190,00/ano)* | • Até **6 seções** ($N$ ilimitado por seção)<br>• Painel consolidado para o Gerente Geral<br>• Portal do Colaborador via *Magic Link* (trocas e consulta sem app)<br>• Logotipo próprio da loja nos PDFs | Gerentes gerais de supermercados, padarias grandes e redes locais. |
| **Redes (`ENTERPRISE`)** | **Sob consulta** | • Lojas e seções ilimitadas<br>• Auditoria jurídica centralizada e integração API com ponto/ERP | Redes supermercadistas e departamentos de RH. |

### 6.2 Matriz de *Feature Flags* (`utils/planPermissions.js`)

O sistema deve compartilhar um módulo puro `planPermissions.js` entre front-end e back-end para controlar os limites em tempo real:

```javascript
export const PLAN_LIMITS = {
  FREE: {
    maxEmployeesPerDept: 10,
    maxDepartments: 1,
    allowCleanExport: false, // Exibe marca d'água + QR Code no rodapé
    allowWhatsappBulkSend: false,
    allowEmployeePortal: false,
    allowHistory: false,
    allowCustomLogo: false,
  },
  LEADER_MONTHLY: {
    maxEmployeesPerDept: Infinity,
    maxDepartments: 1,
    allowCleanExport: true,
    allowWhatsappBulkSend: true,
    allowEmployeePortal: false,
    allowHistory: true,
    allowCustomLogo: false,
  },
  TRANSITION_PASS: {
    maxEmployeesPerDept: Infinity,
    maxDepartments: 1,
    allowCleanExport: true,
    allowWhatsappBulkSend: true,
    allowEmployeePortal: false,
    allowHistory: true,
    allowCustomLogo: false,
  },
  STORE_MULTI: {
    maxEmployeesPerDept: Infinity,
    maxDepartments: 6,
    allowCleanExport: true,
    allowWhatsappBulkSend: true,
    allowEmployeePortal: true,
    allowHistory: true,
    allowCustomLogo: true,
  },
  ENTERPRISE: {
    maxEmployeesPerDept: Infinity,
    maxDepartments: Infinity,
    allowCleanExport: true,
    allowWhatsappBulkSend: true,
    allowEmployeePortal: true,
    allowHistory: true,
    allowCustomLogo: true,
  },
};
```

### 6.3 Mecânica de Conversão (*Paywall* no "Momento Aha!")

1. **Entrada Sem Atrito:** O usuário acessa `planilhaescala5x2.com.br`, cadastra ou cola sua lista de $N = 26$ funcionários e clica em **"Gerar Escala 5x2"** (permitido em modo de pré-visualização interativa).
2. **Entrega de Valor Visível:** O sistema exibe a grade completa na tela, mostrando que os domingos foram revezados e que ninguém violou as $11\text{h}$ de interjornada.
3. **Gatilho de Bloqueio na Ação Final:** Quando $N > 10$ e o plano for `FREE`, ao clicar em **"Baixar PDF Limpo para Mural"**, **"Exportar Imagem sem Marca d'Água"** ou **"Enviar Escalas no WhatsApp"**, o sistema abre o **Modal de Desbloqueio Imediato**:
   * *Copy sugerida:* *"Sua escala de {N} funcionários está pronta e 100% dentro da CLT. Desbloqueie agora para imprimir sem marca d'água e enviar no WhatsApp da equipe."*
   * Exibe duas opções lado a lado: **Assinar Plano Líder (R$ 39,90/mês)** ou **Passe Transição 45 Dias (R$ 59,90 no Pix sem mensalidade)**.

### 6.4 Fluxo Técnico de Checkout Pix e Webhook (Node.js/Express)

1. **Criação da Cobrança (`POST /api/billing/checkout`):**
   * Recebe `{ planPurchased, billingCycle, paymentMethod }` (`'PIX'` ou `'CREDIT_CARD'`).
   * Chama a API do gateway (AbacatePay / Asaas / Mercado Pago) gerando uma cobrança com `externalReference = transaction.id`.
   * Retorna para o React o `pixQrCode` (base64) e `pixCopyPaste` para exibição dentro do próprio modal sem tirar o usuário do app.
2. **Confirmação Instantânea (`POST /api/webhooks/payments`):**
   * Valida o token/assinatura do webhook no Express.
   * Quando o status recebido for `PAID` / `CONFIRMED`:
     * Atualiza `PaymentTransaction.status = 'PAID'`.
     * Atualiza `Organization.plan` e `Organization.subscriptionStatus = 'ACTIVE'`.
     * Se `planPurchased === 'TRANSITION_PASS'`, define `Organization.planExpiresAt = hoje + 45 dias`.
   * O front-end faz *polling* leve a cada 3 segundos (`GET /api/billing/status/:transactionId`) enquanto o QR Code está aberto; assim que confirmado, fecha o modal e dispara o download do PDF/PNG automaticamente.
3. **Middleware de Expiração:**
   * Verifica em toda requisição autenticada se `plan === 'TRANSITION_PASS'` e `new Date() > new Date(planExpiresAt)`. Caso expirado, rebaixa automaticamente para `FREE` preservando os dados cadastrados.

### 6.5 Motores de Crescimento Viral e Aquisição Integrados

* **Vantagem de SEO Exato (`planilhaescala5x2.com.br`):** O domínio corresponde exatamente ao termo de maior volume de busca no Google durante a transição da EC 141/2026, reduzindo o custo de aquisição orgânica.
* **Loop Viral no Mural (QR Code):** Toda escala exportada no plano `FREE` imprime no rodapé um QR Code pequeno apontando para `https://planilhaescala5x2.com.br` com o texto: *"Escala 5x2 gerada em 30s sem erro de CLT — Crie a do seu setor grátis em planilhaescala5x2.com.br"*.
* **Indicação Entre Líderes da Mesma Loja:** Dentro do painel existe um botão **"Indique outro chefe de seção e ganhe +30 dias grátis"**. Quando um indicado ativa qualquer plano pago, o sistema soma $+30$ dias em `bonusDaysAccumulated` para ambos.
* **Ferramentas Gratuitas de Topo de Funil (SEO):** Rotas públicas (`/calculadora-42h` e `/simulador-rodizio-domingo`) que resolvem dúvidas pontuais da EC 141/2026 e convertem o visitante para o gerador completo.

---

## 7. Requisitos Não-Funcionais e Segurança (LGPD)

* **Privacidade e LGPD:** Minimização de dados pessoais (exige apenas nome, função e telefone opcional — não exige CPF ou endereço para operar). Criptografia em trânsito (TLS 1.3) e em repouso.
* **Trilha de Auditoria Imutável:** Toda publicação de escala e aprovação de troca salva *timestamp*, IP/usuário responsável e estado anterior, servindo como evidência documental em fiscalizações do Ministério do Trabalho ou ações trabalhistas.
* **Resiliência Offline:** Alterações feitas na grade sem conexão são salvas em `IndexedDB`/`localStorage` e sincronizadas automaticamente assim que o dispositivo recupera internet.

---

## 8. Prompts Estruturados para Construção por Fases (100% JavaScript)

Para obter o melhor resultado em ferramentas de desenvolvimento com IA (como **Lovable**, **Bolt.new**, **Cursor**, **Replit** ou **Claude**), construa o sistema em **3 etapas sequenciais** usando os prompts abaixo:

### Etapa 1: Prompt de Base e Motor Operacional (Frontend React `.jsx`)

```
Atue como um Engenheiro de Software Sênior e Product Designer especialista em SaaS B2B para varejo.
Construa a base completa do aplicativo web responsivo (mobile-first) "Planilha Escala 5x2" (domínio planilhaescala5x2.com.br) utilizando EXCLUSIVAMENTE JavaScript puro (arquivos .jsx e .js — NÃO use TypeScript, interfaces ou arquivos .ts/.tsx), com React, Vite, Tailwind CSS e Lucide Icons.

Requisitos obrigatórios desta etapa:
1. Arquitetura Multi-Seção e Equipe Dinâmica (N funcionários):
   - Interface com a familiaridade visual de uma planilha inteligente (limpa, direta e sem burocracia de RH).
   - Permitir criar múltiplas seções (ex: Açougue, Frente de Caixa, Padaria) e cadastrar qualquer quantidade N de funcionários (1 a 200+).
   - Incluir cadastro individual, importação em lote ("Colar Lista de Nomes"), status do colaborador (Ativo, Férias, Atestado) e botão opcional "Carregar Loja Exemplo (Seção com 26 Funcionários)".
   - Divisão automática e dinâmica dos N funcionários ativos em 3 grupos equilibrados para rodízio de domingos (aritmética modular).
2. Configuração de Turnos e Cobertura:
   - CRUD de turnos (nome, código, início, fim, intervalo intrajornada, cor) e metas mínimas de cobertura por dia da semana e por tags obrigatórias (ex: "Líder", "Abertura", "Fechamento").
3. Gerador Automático 5x2 + Validador Trabalhista ("Semáforo CLT") em JS puro:
   - Crie módulos puros em `src/utils/scheduleGenerator.js` e `src/utils/cltValidator.js`.
   - O algoritmo deve gerar a escala semanal garantindo 5 dias de trabalho e 2 folgas para cada um dos N ativos, aplicando o rodízio de domingo (Semana 1, 2 e 3), concentrando folgas entre segunda e quarta-feira, respeitando células travadas (isPinned) e impedindo mais de 6 dias consecutivos trabalhados na transição entre semanas.
   - Validação visual em tempo real alertando: interjornada < 11h (vermelho), excesso/falta de folgas na semana (vermelho), mais de 6 dias seguidos (vermelho) e falta de cobertura/tags mínimas (amarelo).
4. Grade Interativa, Feature Flags e Exportação WhatsApp-First:
   - Crie `src/utils/planPermissions.js` com os limites dos planos FREE (até 10 funcionários), LEADER_MONTHLY, TRANSITION_PASS e STORE_MULTI.
   - Matriz N funcionários x 7 dias com busca, filtros, cabeçalho e primeira coluna fixos, linha de cobertura horária (heatmap) e modal de exportação que gera texto resumido para WhatsApp e baixa imagem PNG completa sem cortes (exibindo marca d'água discreta com planilhaescala5x2.com.br quando o plano for FREE com N > 10 e botão de upgrade).
```

### Etapa 2: Prompt de Backend Node.js/Express, Banco e Portal do Colaborador

```
Agora evolua o "Planilha Escala 5x2" (planilhaescala5x2.com.br) conectando o front-end React (.jsx) a um backend RESTful completo em Node.js + Express (arquivos .js com ES Modules, sem TypeScript) e PostgreSQL (com Prisma ORM em JavaScript):

1. API Express, Banco de Dados e Multi-Tenancy:
   - Implemente as rotas Express (`/api/auth`, `/api/organizations`, `/api/departments`, `/api/employees`, `/api/absences`, `/api/schedules`, `/api/swaps`) e middlewares de autenticação JWT e isolamento por `organizationId`.
   - Modele no `schema.prisma` as entidades Organization (com plan, subscriptionStatus, planExpiresAt, referralCode, bonusDaysAccumulated), PaymentTransaction, Store, Department, UserAccount, ShiftTemplate, Employee, Absence, ScheduleCycle, DailyAssignment, ShiftSwapRequest e AuditLog.
   - Crie controle de acesso para Gerente de Loja (vê todas as seções consolidadas) e Chefe de Seção (gerencia sua equipe).
2. Gestão de Férias, Atestados e Restrições:
   - Adicione calendário de ausências (Férias/Atestado) que bloqueia automaticamente os dias na grade e recalcula a capacidade disponível da seção.
   - Adicione restrições individuais por funcionário (ex: dias/turnos indisponíveis) respeitadas pelo gerador automático.
3. Portal do Colaborador (Zero-App via Magic Link):
   - Crie uma rota pública `/minha-escala/:accessToken` em React (.jsx) otimizada para celular onde o funcionário visualiza seus turnos, suas folgas e seu próximo domingo de folga sem precisar criar login.
   - Permita que o funcionário solicite troca de turno/folga com um colega; a API Express deve rodar o validador CLT (`cltValidator.js`, verificando < 11h interjornada e cobertura de tags) antes de registrar a solicitação para aprovação do gestor.
```

### Etapa 3: Prompt de Monetização Pix, Paywall, Automação WhatsApp e Relatórios

```
Finalize o ecossistema SaaS do "Planilha Escala 5x2" (planilhaescala5x2.com.br) em JavaScript puro (React .jsx + Node.js/Express .js) implementando monetização instantânea via Pix/Assinatura, paywall de conversão e automação WhatsApp:

1. Paywall no "Momento Aha!" e Checkout Pix Instantâneo:
   - No front-end React (.jsx), quando uma organização FREE tiver N > 10 funcionários e clicar em "Exportar PDF/PNG Limpo" ou "Enviar no WhatsApp", abra um Modal de Desbloqueio oferecendo: Plano Líder (R$ 39,90/mês) ou Passe Transição (R$ 59,90 pagamento único via Pix por 45 dias).
   - No Express, crie `POST /api/billing/checkout` (integrado a gateway brasileiro como AbacatePay/Asaas/Mercado Pago via SDK JS) que gera QR Code Pix e código Copia e Cola, e `GET /api/billing/status/:transactionId` para polling em tempo real no front-end.
   - Crie `POST /api/webhooks/payments` no Express para validar o pagamento, ativar o plano (definindo `planExpiresAt = +45 dias` no Passe Transição) e conceder +30 dias bônus caso tenha sido usado um `referralCode` válido.
   - Adicione middleware de verificação de expiração do Passe Transição e limites do `planPermissions.js`.
2. Exportação Corporativa e Loop Viral:
   - Adicione geração de PDF A4 assinável para mural/RH (incluindo QR Code de divulgação apontando para https://planilhaescala5x2.com.br no rodapé para usuários FREE e logotipo personalizado da loja para usuários STORE_MULTI) e exportação em Excel (.xlsx).
   - Implemente painel de indicação ("Indique outro líder da loja e ganhe 30 dias grátis") e rotas públicas SEO (`/calculadora-42h` e `/simulador-rodizio-domingo`).
3. Integração WhatsApp & Publicação Oficial:
   - Na rota `POST /api/schedules/:id/publish` do Express, grave registro imutável no AuditLog e dispare via webhook/API do WhatsApp a escala individual e o link `https://planilhaescala5x2.com.br/minha-escala/:accessToken` para cada funcionário.
```

---

## 9. Orquestração de Modelos para Construção com Claude Code (MVP)

O desenvolvimento com Claude Code + plugin ECC segue o guia detalhado em [`orquestracao_de_modelos.md`](./orquestracao_de_modelos.md), que define o escopo do MVP, o plano de fatias, os critérios de aceite do núcleo e as regras de delegação para subagentes. Resumo dos papéis:

| Modelo | Papel | Use para | Não use para |
| :--- | :--- | :--- | :--- |
| **Opus 5.5** | Orquestrador (sessão principal) e engenheiro de regras | Planejamento (`/ecc:plan`), `cltValidator.js`, `scheduleGenerator.js`, revisão das regras trabalhistas, integração entre fatias | Boilerplate, textos, tarefas mecânicas |
| **Fable** | Revisor sênior pontual | Revisão adversarial final (`/ecc:orch-review`), decisões de arquitetura difíceis, desempate entre Opus e revisores | Implementação do dia a dia (é o mais caro) |
| **Sonnet 5.5** | Implementador principal | Componentes React, store Zustand, rotas Express, schema Prisma, exportação PNG/texto | Algoritmo do gerador e regras CLT |
| **Haiku 5.5** | Executor mecânico | Scaffold, cópia de contratos da spec para código, testes repetitivos de UI, textos, README, lint | Qualquer decisão de regra de negócio |

**Escopo do MVP:** Fase 1 completa + esqueleto da API (Express, Prisma, JWT, multi-tenant, Magic Link só leitura). Trocas, Pix, WhatsApp API, PDF/Excel e painel do Gerente Geral ficam no backlog.