import jwt from 'jsonwebtoken';

export const TOKEN_TTL = '7d';

/**
 * Assina o JWT de sessão (HS256, 7 dias) com `sub`, `organizationId`, `role` e `tv` (versão do token
 * do usuário; subir `tokenVersion` revoga todos os tokens anteriores).
 * @param {{ id: string, organizationId: string, role: string, tokenVersion?: number }} user
 * @param {string} secret
 * @param {{ expiresIn?: string | number }} [options]
 * @returns {string}
 */
export function signToken(user, secret, { expiresIn = TOKEN_TTL } = {}) {
  return jwt.sign({ organizationId: user.organizationId, role: user.role, tv: user.tokenVersion ?? 0 }, secret, {
    algorithm: 'HS256',
    expiresIn,
    subject: user.id,
  });
}

/**
 * Valida assinatura e expiração (somente HS256).
 * @param {string} token
 * @param {string} secret
 * @returns {import('jsonwebtoken').JwtPayload}
 * @throws {import('jsonwebtoken').JsonWebTokenError}
 */
export function verifyToken(token, secret) {
  const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
  if (typeof payload === 'string') throw new jwt.JsonWebTokenError('payload inválido');
  return payload;
}
