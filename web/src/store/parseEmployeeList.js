/**
 * Parser do recurso "Colar Lista de Nomes" (listas coladas do WhatsApp ou Excel).
 */

/** Marcadores de lista e numeração no início da linha ("1.", "1)", "01 -", "-", "•", "*"). */
const LEADING_NOISE = /^\s*(?:(?:\d{1,3}\s*[.)\-–—:]\s+|\d{1,3}[.)])|[-•*·–—▪●]\s+)/;
/** Candidato a telefone: dígitos com parênteses, espaços, pontos e traços no meio. */
const PHONE_CANDIDATE = /\+?\(?\d[\d\s().-]*\d/g;
/** Separadores entre nome, função e telefone: " - ", ";", tab ou ",". */
const FIELD_SEPARATOR = /\s+[-–—]\s+|[;\t,]/;

/** @param {string} text */
const normalizeSpaces = (text) => text.replace(/\s+/g, ' ').trim();

/**
 * Converte o texto colado em uma lista de pessoas. Uma pessoa por linha; função e
 * telefone são opcionais. Telefone = sequência com 10 ou mais dígitos.
 * @param {string} text
 * @returns {Array<{ name: string, roleTitle?: string, phone?: string }>}
 */
export function parseEmployeeList(text) {
  if (typeof text !== 'string') return [];
  const result = [];
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();
    // Remove marcadores/numeração (pode haver mais de um, ex.: "- 1) João").
    for (let i = 0; i < 3 && LEADING_NOISE.test(line); i += 1) line = line.replace(LEADING_NOISE, '');
    line = line.trim();
    if (!line) continue;

    let phone;
    const candidates = line.match(PHONE_CANDIDATE) ?? [];
    const found = candidates.find((c) => c.replace(/\D/g, '').length >= 10);
    if (found) {
      phone = normalizeSpaces(found);
      line = line.replace(found, ' ; ');
    }

    const parts = line
      .split(FIELD_SEPARATOR)
      .map(normalizeSpaces)
      .filter(Boolean);
    const [name, roleTitle] = parts;
    if (!name || !/\p{L}/u.test(name)) continue;

    const person = { name };
    if (roleTitle) person.roleTitle = roleTitle;
    if (phone) person.phone = phone;
    result.push(person);
  }
  return result;
}
