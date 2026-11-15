/**
 * Feature flags por plano (especificação, seção 6.2 e 6.4).
 * Módulo puro, sem dependências: usado pelo front-end (web) e pelo back-end (api).
 */

/**
 * @typedef {'FREE' | 'LEADER_MONTHLY' | 'TRANSITION_PASS' | 'STORE_MULTI' | 'ENTERPRISE'} PlanType
 */

/**
 * @typedef {Object} PlanLimits
 * @property {number} maxEmployeesPerDept
 * @property {number} maxDepartments
 * @property {boolean} allowCleanExport
 * @property {boolean} allowWhatsappBulkSend
 * @property {boolean} allowEmployeePortal
 * @property {boolean} allowHistory
 * @property {boolean} allowCustomLogo
 */

/**
 * @typedef {Object} OrganizationPlanInfo
 * @property {PlanType} [plan]
 * @property {string} [planExpiresAt] - ISO Date (obrigatório para TRANSITION_PASS)
 */

/**
 * Matriz de feature flags por plano. Congelada em profundidade.
 * @type {Readonly<Record<PlanType, Readonly<PlanLimits>>>}
 */
export const PLAN_LIMITS = Object.freeze({
  FREE: Object.freeze({
    maxEmployeesPerDept: 10,
    maxDepartments: 1,
    allowCleanExport: false, // Exibe marca d'água + QR Code no rodapé
    allowWhatsappBulkSend: false,
    allowEmployeePortal: false,
    allowHistory: false,
    allowCustomLogo: false,
  }),
  LEADER_MONTHLY: Object.freeze({
    maxEmployeesPerDept: Infinity,
    maxDepartments: 1,
    allowCleanExport: true,
    allowWhatsappBulkSend: true,
    allowEmployeePortal: false,
    allowHistory: true,
    allowCustomLogo: false,
  }),
  TRANSITION_PASS: Object.freeze({
    maxEmployeesPerDept: Infinity,
    maxDepartments: 1,
    allowCleanExport: true,
    allowWhatsappBulkSend: true,
    allowEmployeePortal: false,
    allowHistory: true,
    allowCustomLogo: false,
  }),
  STORE_MULTI: Object.freeze({
    maxEmployeesPerDept: Infinity,
    maxDepartments: 6,
    allowCleanExport: true,
    allowWhatsappBulkSend: true,
    allowEmployeePortal: true,
    allowHistory: true,
    allowCustomLogo: true,
  }),
  ENTERPRISE: Object.freeze({
    maxEmployeesPerDept: Infinity,
    maxDepartments: Infinity,
    allowCleanExport: true,
    allowWhatsappBulkSend: true,
    allowEmployeePortal: true,
    allowHistory: true,
    allowCustomLogo: true,
  }),
});

/**
 * Retorna os limites do plano. Plano desconhecido ou ausente usa os limites de FREE.
 * @param {string | undefined | null} plan
 * @returns {Readonly<PlanLimits>}
 */
export function getPlanLimits(plan) {
  if (typeof plan === 'string' && Object.hasOwn(PLAN_LIMITS, plan)) {
    return PLAN_LIMITS[/** @type {PlanType} */ (plan)];
  }
  return PLAN_LIMITS.FREE;
}

/**
 * Indica se o plano possui a feature booleana informada.
 * Chave inexistente, ou chave que não é booleana, resulta em false.
 * @param {string | undefined | null} plan
 * @param {string} featureKey - Ex: 'allowCleanExport'
 * @returns {boolean}
 */
export function canUseFeature(plan, featureKey) {
  const limits = getPlanLimits(plan);
  if (!Object.hasOwn(limits, featureKey)) return false;
  return limits[/** @type {keyof PlanLimits} */ (featureKey)] === true;
}

/**
 * Indica se ainda cabe mais um funcionário no departamento.
 * @param {string | undefined | null} plan
 * @param {number} currentCount - Quantidade atual de funcionários no departamento
 * @returns {boolean} true se currentCount < maxEmployeesPerDept
 */
export function canAddEmployee(plan, currentCount) {
  return currentCount < getPlanLimits(plan).maxEmployeesPerDept;
}

/**
 * Indica se ainda cabe mais um departamento.
 * @param {string | undefined | null} plan
 * @param {number} currentCount - Quantidade atual de departamentos
 * @returns {boolean} true se currentCount < maxDepartments
 */
export function canAddDepartment(plan, currentCount) {
  return currentCount < getPlanLimits(plan).maxDepartments;
}

/**
 * Indica se a exportação deve exibir marca d'água + QR Code.
 * @param {string | undefined | null} plan
 * @returns {boolean} true quando allowCleanExport é falso
 */
export function shouldShowWatermark(plan) {
  return !getPlanLimits(plan).allowCleanExport;
}

/**
 * Indica se o Passe Transição da organização já expirou.
 * Só é verdadeiro para plan === 'TRANSITION_PASS' com planExpiresAt anterior a `now`.
 * @param {OrganizationPlanInfo} organization
 * @param {Date} [now=new Date()]
 * @returns {boolean}
 */
export function isTransitionPassExpired(organization, now = new Date()) {
  if (!organization || organization.plan !== 'TRANSITION_PASS') return false;
  if (!organization.planExpiresAt) return false;
  return now > new Date(organization.planExpiresAt);
}

/**
 * Plano efetivo da organização (spec 6.4, item 3): se o Passe Transição expirou,
 * rebaixa para 'FREE'; plano ausente ou desconhecido também vira 'FREE'.
 * @param {OrganizationPlanInfo} organization
 * @param {Date} [now=new Date()]
 * @returns {PlanType}
 */
export function getEffectivePlan(organization, now = new Date()) {
  if (isTransitionPassExpired(organization, now)) return 'FREE';
  const plan = organization?.plan;
  return typeof plan === 'string' && Object.hasOwn(PLAN_LIMITS, plan) ? plan : 'FREE';
}
