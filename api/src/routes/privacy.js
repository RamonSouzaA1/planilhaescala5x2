import { Router } from 'express';
import { sendOk } from '../errors.js';

/** Contato do encarregado de dados (placeholder até a definição do canal oficial). */
export const PRIVACY_CONTACT = 'privacidade@planilhaescala5x2.com.br';

/**
 * Texto curto de privacidade (LGPD). `retentionDays` é a retenção configurada para o IP do log.
 * @param {number} retentionDays
 */
export function privacyPolicy(retentionDays) {
  return {
    version: '2026-11',
    controller: 'Planilha Escala 5x2',
    collected: [
      { data: 'Nome', subjects: 'usuários e funcionários cadastrados', required: true },
      { data: 'Função (cargo e papel de acesso)', subjects: 'usuários e funcionários cadastrados', required: true },
      { data: 'Telefone', subjects: 'funcionários cadastrados', required: false },
      { data: 'E-mail', subjects: 'usuários da conta', required: true },
      { data: 'Endereço IP (anonimizado)', subjects: 'usuários que alteram dados', required: true },
    ],
    purpose: 'Montar, validar e divulgar escalas de trabalho 5x2 conforme a CLT e manter a trilha de auditoria das alterações. Os dados não são vendidos nem usados para publicidade.',
    retention: {
      accountData: 'Enquanto a conta existir; apagados em definitivo quando o titular da conta exclui a organização.',
      auditIp: `O último octeto do IP (IPv4) ou os últimos 80 bits (IPv6) são descartados ao gravar; o endereço restante é removido após ${retentionDays} dias.`,
      auditLog: 'Registros de auditoria (sem IP após o prazo) acompanham a vida da conta.',
    },
    rights: [
      'Confirmação e acesso aos dados',
      'Correção de dados incompletos ou desatualizados',
      'Portabilidade (exportação em JSON pelo titular da conta)',
      'Eliminação dos dados (exclusão da organização pelo titular da conta)',
      'Informação sobre compartilhamento e revogação do consentimento',
    ],
    contact: PRIVACY_CONTACT,
  };
}

/**
 * Rota pública `GET /api/privacy`.
 * @param {{ config: import('../config.js').AppConfig }} deps
 * @returns {import('express').Router}
 */
export function privacyRoutes({ config }) {
  const router = Router();
  router.get('/', (_req, res) => sendOk(res, privacyPolicy(config.auditIpRetentionDays)));
  return router;
}
