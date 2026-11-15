/**
 * Contratos de objeto (JSDoc) do modelo de dados, conforme
 * especificacao_de_produto_planilha_escala_5x2.md, seção 4.
 * Compartilhado entre web e api. Os typedefs são copiados da especificação;
 * as constantes abaixo são as uniões que o código usa em tempo de execução.
 */

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

export const PLAN_TYPES = Object.freeze(['FREE', 'LEADER_MONTHLY', 'TRANSITION_PASS', 'STORE_MULTI', 'ENTERPRISE']);
export const SUBSCRIPTION_STATUSES = Object.freeze(['ACTIVE', 'EXPIRED', 'PAST_DUE', 'CANCELED']);
export const USER_ROLES = Object.freeze(['OWNER', 'STORE_MANAGER', 'SECTION_LEADER', 'HR_AUDITOR']);
export const DAYS_OF_WEEK = Object.freeze(['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM']);
export const EMPLOYEE_STATUSES = Object.freeze(['ACTIVE', 'VACATION', 'MEDICAL_LEAVE', 'INACTIVE']);
export const ASSIGNMENT_TYPES = Object.freeze(['WORK', 'OFF', 'ABSENCE']);
export const SUNDAY_RULES = Object.freeze(['1_IN_3', '1_IN_2', 'CUSTOM']);
