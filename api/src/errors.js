/**
 * Erro de aplicação com status HTTP e código estável para o front-end.
 */
export class AppError extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {string} message
   * @param {unknown} [details]
   */
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** @param {string} [message] */
export const notFound = (message = 'Recurso não encontrado.') => new AppError(404, 'NOT_FOUND', message);
/** @param {string} message @param {unknown} [details] */
export const badRequest = (message, details) => new AppError(400, 'VALIDATION_ERROR', message, details);
/** @param {string} [message] */
export const unauthorized = (message = 'Autenticação necessária.') => new AppError(401, 'UNAUTHORIZED', message);
/** @param {string} [message] */
export const forbidden = (message = 'Sem permissão para esta ação.') => new AppError(403, 'FORBIDDEN', message);

/**
 * Resposta de sucesso padrão `{ success: true, data }`.
 * @param {import('express').Response} res
 * @param {unknown} data
 * @param {number} [status=200]
 */
export function sendOk(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

/**
 * Garante que o recurso existe; senão responde 404 (inclusive para recurso de outra organização).
 * @template T
 * @param {T | null | undefined} value
 * @returns {T}
 */
export function found(value) {
  if (value === null || value === undefined) throw notFound();
  return value;
}
