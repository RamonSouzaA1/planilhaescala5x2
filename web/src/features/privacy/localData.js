/**
 * Acesso direto ao localStorage do app (sem depender do store): exportar, apagar e baixar.
 * Usado também pela tela de erro, que precisa funcionar mesmo com o store quebrado.
 */

export const STORAGE_PREFIX = 'planilha-escala-5x2:';
/** Cópia do JSON persistido quando ele estava corrompido, para o usuário ainda poder exportá-lo. */
export const CORRUPTED_BACKUP_KEY = `${STORAGE_PREFIX}corrupted-backup`;
export const PRIVACY_EMAIL = 'privacidade@planilhaescala5x2.com.br';

/** @returns {string[]} chaves do app presentes no localStorage */
export function listAppKeys() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    return keys.sort();
  } catch {
    return [];
  }
}

/** @returns {boolean} há algum dado do app neste navegador */
export const hasLocalData = () => listAppKeys().length > 0;

const parseOrRaw = (raw) => {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

/**
 * Monta o conteúdo do arquivo de exportação com tudo que o app guarda neste navegador.
 * @param {Record<string, unknown>} [extra] - dados adicionais (ex.: estado atual do store)
 * @returns {string} JSON legível
 */
export function buildExportJson(extra = {}) {
  const storage = {};
  for (const key of listAppKeys()) storage[key] = parseOrRaw(localStorage.getItem(key));
  return JSON.stringify({ app: 'planilha-escala-5x2', exportedAt: new Date().toISOString(), storage, ...extra }, null, 2);
}

/** Remove todas as chaves do app do localStorage. */
export function removeAppKeys() {
  for (const key of listAppKeys()) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error('Não foi possível remover', key, error);
    }
  }
}

/** Baixa o texto como arquivo JSON pelo navegador. */
export function downloadJson(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const exportFilename = () => `escala-5x2-meus-dados-${new Date().toISOString().slice(0, 10)}.json`;
