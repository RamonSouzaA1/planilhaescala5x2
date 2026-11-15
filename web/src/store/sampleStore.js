/**
 * Dados da "Loja Exemplo" (Açougue, 26 funcionários) para demonstração e testes.
 */

import { assignSundayGroups } from '@escala/shared/utils/sundayRotation.js';

/** [nome, função, tags] — Encarregados primeiro, para cair um por grupo de domingo. */
const PEOPLE = [
  ['Carlos Eduardo Menezes', 'Encarregado', ['Líder']],
  ['Marcia Aparecida Souza', 'Encarregado', ['Líder']],
  ['Roberto Tavares Lima', 'Encarregado', ['Líder']],
  ['José Antônio Ferreira', 'Açougueiro', ['Serra']],
  ['Luciana Pereira Costa', 'Açougueiro', ['Serra']],
  ['Anderson Silva Rocha', 'Açougueiro', ['Serra']],
  ['Fernanda Oliveira Dias', 'Açougueiro', ['Serra']],
  ['Paulo Henrique Gomes', 'Açougueiro', ['Serra']],
  ['Juliana Martins Araújo', 'Açougueiro', []],
  ['Marcos Vinícius Barbosa', 'Açougueiro', []],
  ['Patrícia Ribeiro Nunes', 'Açougueiro', []],
  ['Rafael Cardoso Teixeira', 'Açougueiro', []],
  ['Sandra Regina Moura', 'Açougueiro', []],
  ['Thiago Batista Campos', 'Açougueiro', []],
  ['Aline Cristina Freitas', 'Açougueiro', []],
  ['Wellington Alves Pinto', 'Açougueiro', []],
  ['Camila Rodrigues Melo', 'Balconista', []],
  ['Diego Fernandes Castro', 'Balconista', []],
  ['Vanessa Lopes Andrade', 'Balconista', []],
  ['Gustavo Henrique Santos', 'Balconista', []],
  ['Renata Carvalho Borges', 'Balconista', []],
  ['Leandro Monteiro Reis', 'Balconista', []],
  ['Elaine Cristina Duarte', 'Balconista', []],
  ['Fábio Júnior Correia', 'Balconista', []],
  ['Tatiane Souza Nascimento', 'Balconista', []],
  ['Matheus Gonçalves Vieira', 'Balconista', []],
];

const SHIFT_DEFS = [
  { code: 'T1', name: 'Abertura', startTime: '07:00', endTime: '16:24', color: '#2563EB' },
  { code: 'T2', name: 'Intermediário', startTime: '10:00', endTime: '19:24', color: '#16A34A' },
  { code: 'T3', name: 'Fechamento', startTime: '12:36', endTime: '22:00', color: '#EA580C' },
];

/** Mínimo de pessoas por dia da semana (segunda → domingo). */
const MIN_STAFF = { SEG: 14, TER: 14, QUA: 14, QUI: 16, SEX: 20, SAB: 20, DOM: 15 };
const DAYS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'];

/**
 * Cria os dados do "documento" da Loja Exemplo, com IDs novos a cada chamada.
 * @returns {{
 *   organization: object, departments: object[], activeDepartmentId: string,
 *   employees: object[], shifts: object[], coverageRules: object[],
 *   absences: object[], assignments: object[]
 * }}
 */
export function createSampleDocument() {
  const organization = { id: crypto.randomUUID(), name: 'Loja Exemplo', plan: 'FREE' };
  const department = {
    id: crypto.randomUUID(),
    storeId: organization.id,
    name: 'Açougue',
    defaultSundayRule: '1_IN_3',
    weeklyHoursTarget: 42,
  };
  const createdAt = new Date().toISOString();
  const groups = assignSundayGroups(
    PEOPLE.map((_, i) => ({ id: String(i) })),
    3,
  );
  const employees = PEOPLE.map(([name, roleTitle, tags], i) => ({
    id: crypto.randomUUID(),
    departmentId: department.id,
    name,
    accessToken: crypto.randomUUID(),
    roleTitle,
    tags: [...tags],
    sundayGroup: groups[String(i)],
    status: 'ACTIVE',
    createdAt,
  }));
  const shifts = SHIFT_DEFS.map((def) => ({
    id: crypto.randomUUID(),
    departmentId: department.id,
    ...def,
    breakDurationMinutes: 60,
    isNightShift: false,
  }));
  const coverageRules = DAYS.map((dayOfWeek) => ({
    id: crypto.randomUUID(),
    departmentId: department.id,
    dayOfWeek,
    minTotalStaff: MIN_STAFF[dayOfWeek],
    requiredTags: [
      { tag: 'Líder', minCount: 1 },
      { tag: 'Serra', minCount: 1 },
    ],
    peakHours: dayOfWeek === 'SEX' || dayOfWeek === 'SAB' ? [{ start: '11:00', end: '14:00', minStaff: 12 }] : [],
  }));
  return {
    organization,
    departments: [department],
    activeDepartmentId: department.id,
    employees,
    shifts,
    coverageRules,
    absences: [],
    assignments: [],
  };
}
