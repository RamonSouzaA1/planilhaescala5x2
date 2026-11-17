/**
 * Parser do recurso "Colar Lista de Nomes" (listas coladas do WhatsApp ou Excel).
 * Telefone só é aceito se parecer telefone brasileiro; CPF nunca é guardado.
 */

/** Marcadores de lista e numeração no início da linha ("1.", "1)", "01 -", "-", "•", "*"). */
const LEADING_NOISE = /^\s*(?:(?:\d{1,3}\s*[.)\-–—:]\s+|\d{1,3}[.)])|[-•*·–—▪●]\s+)/;
/** Candidato a telefone/documento: dígitos com parênteses, espaços, pontos e traços no meio. */
const NUMBER_CANDIDATE = /\+?\(?\d[\d\s().-]*\d/g;
/** Separadores entre nome, função e telefone: " - ", ";", tab ou ",". */
const FIELD_SEPARATOR = /\s+[-–—]\s+|[;\t,]/;
/** CPF com máscara (000.000.000-00), com ou sem espaços ao redor dos separadores. */
const MASKED_CPF = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/;
const BARE_CPF = /^\d{11}$/;
/** DDD brasileiro: 11 a 99, sem zero em nenhuma posição. */
const DDD = /^[1-9][1-9]$/;

export const MIN_PHONE_DIGITS = 10;
export const MAX_PHONE_DIGITS = 13;

const normalizeSpaces = (text) => text.replace(/\s+/g, ' ').trim();
const onlyDigits = (text) => text.replace(/\D/g, '');

/** Confere os dois dígitos verificadores de um CPF (11 dígitos, não todos iguais). */
function hasValidCpfCheckDigits(digits) {
  if (!BARE_CPF.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const check = (length) => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += Number(digits[i]) * (length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === Number(digits[9]) && check(10) === Number(digits[10]);
}

/**
 * Indica se o texto tem cara de CPF: formato 000.000.000-00 ou 11 dígitos puros que passam
 * no dígito verificador.
 * @param {string} text
 */
export function looksLikeCpf(text) {
  const value = String(text ?? '').trim();
  if (MASKED_CPF.test(value)) return true;
  return /^[\d.\-]+$/.test(value) && hasValidCpfCheckDigits(onlyDigits(value));
}

/**
 * Valida telefone brasileiro: 10 a 13 dígitos (com ou sem +55), DDD 11–99 e número de celular
 * (9 dígitos começando em 9) ou fixo (8 dígitos começando em 2–9).
 * @param {string} text
 * @returns {boolean}
 */
export function isBrazilianPhone(text) {
  let digits = onlyDigits(String(text ?? ''));
  if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) return false;
  if (digits.length > 11) {
    if (!digits.startsWith('55')) return false;
    digits = digits.slice(2);
  }
  if (digits.length !== 10 && digits.length !== 11) return false;
  if (!DDD.test(digits.slice(0, 2))) return false;
  const number = digits.slice(2);
  return number.length === 9 ? number[0] === '9' : /^[2-9]/.test(number);
}

/**
 * Classifica um campo de telefone digitado.
 * @param {string} text
 * @returns {'empty' | 'ok' | 'cpf' | 'invalid'}
 */
export function classifyPhone(text) {
  if (!String(text ?? '').trim()) return 'empty';
  if (looksLikeCpf(text)) return 'cpf';
  return isBrazilianPhone(text) ? 'ok' : 'invalid';
}

/**
 * Converte o texto colado em pessoas e conta quantos números com cara de CPF foram descartados.
 * @param {string} text
 * @returns {{ people: Array<{ name: string, roleTitle?: string, phone?: string }>, ignoredCpfCount: number }}
 */
export function parseEmployeeListDetailed(text) {
  if (typeof text !== 'string') return { people: [], ignoredCpfCount: 0 };
  const people = [];
  let ignoredCpfCount = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();
    // Remove marcadores/numeração (pode haver mais de um, ex.: "- 1) João").
    for (let i = 0; i < 3 && LEADING_NOISE.test(line); i += 1) line = line.replace(LEADING_NOISE, '');
    line = line.trim();
    if (!line) continue;

    let phone;
    for (const candidate of line.match(NUMBER_CANDIDATE) ?? []) {
      if (onlyDigits(candidate).length < MIN_PHONE_DIGITS) continue;
      // Números longos viram separador: CPF é descartado (e contado); o restante também não vira nome.
      if (looksLikeCpf(candidate)) ignoredCpfCount += 1;
      else if (!phone && isBrazilianPhone(candidate)) phone = normalizeSpaces(candidate);
      line = line.replace(candidate, ' ; ');
    }

    const [name, roleTitle] = line
      .split(FIELD_SEPARATOR)
      .map(normalizeSpaces)
      .filter(Boolean);
    if (!name || !/\p{L}/u.test(name)) continue;

    const person = { name };
    if (roleTitle) person.roleTitle = roleTitle;
    if (phone) person.phone = phone;
    people.push(person);
  }
  return { people, ignoredCpfCount };
}

/**
 * Uma pessoa por linha; função e telefone são opcionais.
 * @param {string} text
 * @returns {Array<{ name: string, roleTitle?: string, phone?: string }>}
 */
export function parseEmployeeList(text) {
  return parseEmployeeListDetailed(text).people;
}
