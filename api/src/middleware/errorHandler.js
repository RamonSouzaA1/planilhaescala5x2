import { ZodError } from 'zod';
import { AppError } from '../errors.js';

/**
 * Rota inexistente → 404 no formato padrão.
 * @type {import('express').RequestHandler}
 */
export function notFoundHandler(_req, res) {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } });
}

/**
 * Handler central de erros: formato `{ success: false, error: { code, message } }`.
 * Nunca devolve stack em produção; 5xx esconde a mensagem interna.
 * @param {import('../config.js').AppConfig} config
 * @returns {import('express').ErrorRequestHandler}
 */
export function errorHandler(config) {
  return (err, _req, res, _next) => {
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'Erro interno do servidor.';
    let details;

    if (err instanceof AppError) {
      ({ status, code, message, details } = err);
    } else if (err instanceof ZodError) {
      status = 400;
      code = 'VALIDATION_ERROR';
      message = 'Dados inválidos.';
      details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    } else if (err?.type === 'entity.parse.failed') {
      status = 400;
      code = 'INVALID_JSON';
      message = 'JSON inválido.';
    } else if (err?.type === 'entity.too.large') {
      status = 413;
      code = 'PAYLOAD_TOO_LARGE';
      message = 'Corpo da requisição grande demais.';
    }

    if (status >= 500) config.logger.error('[api] erro não tratado:', err);

    const error = { code, message };
    if (details !== undefined) error.details = details;
    if (!config.isProduction && status >= 500 && err?.stack) error.stack = err.stack;
    res.status(status).json({ success: false, error });
  };
}
