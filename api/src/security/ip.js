const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV4_MAPPED = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i;
const IPV6_GROUPS = 8;
/** Grupos de 16 bits mantidos no IPv6 (48 bits); os 80 bits restantes são zerados. */
const IPV6_KEPT_GROUPS = 3;

/** Zera o último octeto de um IPv4 válido; devolve null se não for. */
function anonymizeV4(address) {
  const match = IPV4.exec(address);
  if (!match) return null;
  const octets = match.slice(1).map(Number);
  if (octets.some((o) => o > 255)) return null;
  return `${octets[0]}.${octets[1]}.${octets[2]}.0`;
}

/** Expande um IPv6 (com `::`) em 8 grupos hexadecimais; null se inválido. */
function expandV6(address) {
  if (!/^[0-9a-f:]+$/i.test(address) || (address.match(/::/g) ?? []).length > 1) return null;
  const [head, tail] = address.split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail === undefined ? [] : tail ? tail.split(':') : [];
  const missing = IPV6_GROUPS - headGroups.length - tailGroups.length;
  if (tail === undefined ? missing !== 0 : missing < 1) return null;
  const groups = [...headGroups, ...Array(tail === undefined ? 0 : missing).fill('0'), ...tailGroups];
  return groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g)) ? groups.map((g) => g.toLowerCase()) : null;
}

/**
 * Anonimiza o IP antes de gravar no log de auditoria (LGPD): IPv4 perde o último octeto
 * (`203.0.113.45` → `203.0.113.0`) e IPv6 perde os últimos 80 bits (mantém os 48 iniciais).
 * IPv6 mapeado de IPv4 (`::ffff:a.b.c.d`) é tratado como IPv4. Valor ausente ou inválido → null
 * (não grava texto arbitrário).
 * @param {string | undefined | null} ip
 * @returns {string | null}
 */
export function anonymizeIp(ip) {
  if (typeof ip !== 'string') return null;
  const address = ip.trim().split('%')[0];
  const mapped = IPV4_MAPPED.exec(address);
  const v4 = anonymizeV4(mapped ? mapped[1] : address);
  if (v4) return v4;
  const groups = expandV6(address);
  if (!groups) return null;
  const kept = groups.slice(0, IPV6_KEPT_GROUPS).map((g) => g.replace(/^0+(?=.)/, ''));
  return `${kept.join(':')}::`;
}
