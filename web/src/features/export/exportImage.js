import { toPng } from 'html-to-image';

/** Remove acentos e símbolos: "Açougue Loja 1" vira "acougue-loja-1". */
export function slugify(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Ex.: escala-acougue-2026-11-16.png */
export function exportFileName(departmentName, weekStartDate) {
  const slug = slugify(departmentName) || 'setor';
  return `escala-${slug}-${weekStartDate}.png`;
}

/**
 * Renderiza o nó em PNG (pixelRatio 2, fundo branco) e dispara o download.
 * @param {HTMLElement} node
 * @param {string} fileName
 * @returns {Promise<string>} data URL gerada
 */
export async function exportNodeToPng(node, fileName) {
  const dataUrl = await toPng(node, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true });
  const link = document.createElement('a');
  link.download = fileName;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  link.remove();
  return dataUrl;
}
