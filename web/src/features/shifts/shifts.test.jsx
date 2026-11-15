import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useScheduleStore } from '../../store/useScheduleStore.js';
import { DepartmentSettings } from './DepartmentSettings.jsx';
import { ShiftsEditor } from './ShiftsEditor.jsx';
import { CoverageEditor } from './CoverageEditor.jsx';

const store = () => useScheduleStore.getState();
const active = () => store().departments.find((d) => d.id === store().activeDepartmentId);

beforeEach(() => {
  localStorage.clear();
  store().resetAll();
});

const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

function fillShift({ name, code, start, end, brk }) {
  if (name !== undefined) type('Nome do turno', name);
  if (code !== undefined) type('Código', code);
  if (start !== undefined) type('Início', start);
  if (end !== undefined) type('Fim', end);
  if (brk !== undefined) type('Intervalo (min)', brk);
}

describe('DepartmentSettings', () => {
  it('cria setores e troca o setor ativo', () => {
    render(<DepartmentSettings />);
    type('Novo setor', 'Açougue');
    fireEvent.click(screen.getByRole('button', { name: 'Criar setor' }));
    type('Novo setor', 'Padaria');
    fireEvent.click(screen.getByRole('button', { name: 'Criar setor' }));

    expect(store().departments.map((d) => d.name)).toEqual(['Açougue', 'Padaria']);
    expect(active().name).toBe('Açougue');

    const select = screen.getByLabelText('Setor ativo');
    fireEvent.change(select, { target: { value: store().departments[1].id } });
    expect(active().name).toBe('Padaria');
    expect(select).toHaveValue(store().departments[1].id);
  });

  it('muda a meta semanal para 40h e grava as demais regras', () => {
    store().addDepartment({ name: 'Açougue' });
    render(<DepartmentSettings />);
    expect(screen.getByLabelText('Meta semanal')).toHaveValue('42');
    type('Meta semanal', '40');
    expect(active().weeklyHoursTarget).toBe(40);

    type('Regra de domingo', '1_IN_2');
    type('Intervalo mínimo (turnos acima de 6h)', '30');
    type('Deslocamento do ciclo de domingo', '2');
    expect(active()).toMatchObject({ defaultSundayRule: '1_IN_2', minBreakMinutes: 30, sundayCycleOffset: 2 });
  });

  it('renomeia e remove o setor com confirmação', () => {
    store().addDepartment({ name: 'Açougue' });
    render(<DepartmentSettings />);
    fireEvent.click(screen.getByRole('button', { name: 'Renomear setor Açougue' }));
    type('Novo nome do setor', 'Hortifruti');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }));
    expect(active().name).toBe('Hortifruti');

    fireEvent.click(screen.getByRole('button', { name: 'Remover setor Hortifruti' }));
    expect(store().departments).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar remoção' }));
    expect(store().departments).toHaveLength(0);
  });
});

describe('ShiftsEditor', () => {
  beforeEach(() => {
    store().addDepartment({ name: 'Frente de Caixa' });
  });

  it('cria os 3 turnos padrão do varejo (42h/semana)', () => {
    render(<ShiftsEditor />);
    fireEvent.click(screen.getByRole('button', { name: 'Usar turnos padrão do varejo' }));
    const shifts = store().shifts;
    expect(shifts.map((s) => s.code)).toEqual(['T1', 'T2', 'T3']);
    expect(shifts[0]).toMatchObject({ startTime: '07:00', endTime: '16:24', breakDurationMinutes: 60 });
    expect(screen.queryByRole('button', { name: 'Usar turnos padrão do varejo' })).not.toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Lista de turnos' });
    expect(within(list).getAllByTestId('weekly-hours')[0]).toHaveTextContent('Semana (5 dias): 42h dentro da meta de 42h');
    expect(within(list).getAllByTestId('weekly-hours')[0]).toHaveAttribute('data-over', 'false');
  });

  it('marca turno 21:00-06:00 como noturno com horas legais maiores que as de relógio', () => {
    render(<ShiftsEditor />);
    fillShift({ name: 'Noite', code: 'N1', start: '21:00', end: '06:00', brk: '60' });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar turno' }));
    const [shift] = store().shifts;
    expect(shift.isNightShift).toBe(true);
    const list = screen.getByRole('list', { name: 'Lista de turnos' });
    expect(within(list).getByText('Relógio: 8h/dia')).toBeInTheDocument();
    expect(within(list).getByText('Legal: 9h/dia')).toBeInTheDocument();
    expect(within(list).getByText('Noturno')).toBeInTheDocument();
  });

  it('alerta intervalo insuficiente e jornada acima de 10h, e mostra semana acima da meta', () => {
    render(<ShiftsEditor />);
    fillShift({ start: '06:00', end: '18:00', brk: '30' });
    const alerts = screen.getAllByRole('alert').map((a) => a.textContent);
    expect(alerts.some((t) => t.includes('Intervalo menor que o exigido: mínimo de 60 min'))).toBe(true);
    expect(alerts.some((t) => t.includes('acima de 10h'))).toBe(true);
    expect(screen.getByTestId('weekly-hours')).toHaveAttribute('data-over', 'true');
  });

  it('respeita o intervalo mínimo de 30 min do setor', () => {
    store().updateDepartment(store().activeDepartmentId, { minBreakMinutes: 30 });
    render(<ShiftsEditor />);
    fillShift({ start: '08:00', end: '16:00', brk: '30' });
    expect(screen.queryByText(/Intervalo menor que o exigido/)).not.toBeInTheDocument();
  });

  it('bloqueia código duplicado e campos obrigatórios', () => {
    render(<ShiftsEditor />);
    fillShift({ name: 'Abertura', code: 'T1', start: '07:00', end: '16:00' });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar turno' }));
    expect(store().shifts).toHaveLength(1);

    fillShift({ name: 'Outro', code: 't1', start: '09:00', end: '17:00' });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar turno' }));
    expect(store().shifts).toHaveLength(1);
    expect(screen.getByText('O código t1 já está em uso neste setor.')).toBeInTheDocument();
    expect(screen.getByLabelText('Código')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Código')).toHaveAttribute('aria-describedby', 'shift-code-error');

    fillShift({ code: 'T2', start: '', brk: '-5' });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar turno' }));
    expect(store().shifts).toHaveLength(1);
    expect(screen.getByText('Informe o início.')).toBeInTheDocument();
    expect(screen.getByText('O intervalo deve ser 0 ou mais minutos.')).toBeInTheDocument();
  });

  it('edita e remove um turno', () => {
    store().addShift({ name: 'Abertura', code: 'T1', startTime: '07:00', endTime: '16:00', breakDurationMinutes: 60, color: '#1D4ED8', isNightShift: false });
    render(<ShiftsEditor />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar turno T1' }));
    expect(screen.getByLabelText('Nome do turno')).toHaveValue('Abertura');
    fillShift({ name: 'Manhã', end: '15:00' });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar turno' }));
    expect(store().shifts).toHaveLength(1);
    expect(store().shifts[0]).toMatchObject({ name: 'Manhã', endTime: '15:00', code: 'T1' });

    fireEvent.click(screen.getByRole('button', { name: 'Remover turno T1' }));
    expect(store().shifts).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar remoção' }));
    expect(store().shifts).toHaveLength(0);
  });
});

describe('CoverageEditor', () => {
  beforeEach(() => {
    store().addDepartment({ name: 'Açougue' });
    store().addEmployeesBulk([
      { name: 'Ana', tags: ['Líder'] },
      { name: 'Bia', tags: ['Serra'] },
      { name: 'Caio', tags: [] },
    ]);
  });

  it('define mínimo e tag na segunda e copia para terça e quarta', () => {
    render(<CoverageEditor />);
    type('Mínimo de pessoas na segunda', '2');
    type('Nova tag obrigatória na segunda', 'Líder');
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar tag obrigatória na segunda' }));

    const rules = () => store().coverageRules;
    expect(rules()).toHaveLength(1);
    expect(rules()[0]).toMatchObject({ dayOfWeek: 'SEG', minTotalStaff: 2, requiredTags: [{ tag: 'Líder', minCount: 1 }] });
    expect(screen.getByText('Líder ≥ 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copiar segunda para terça e quarta' }));
    const days = rules().map((r) => r.dayOfWeek).sort();
    expect(days).toEqual(['QUA', 'SEG', 'TER']);
    const ter = rules().find((r) => r.dayOfWeek === 'TER');
    expect(ter).toMatchObject({ minTotalStaff: 2, requiredTags: [{ tag: 'Líder', minCount: 1 }] });
    expect(screen.getByLabelText('Mínimo de pessoas na quarta')).toHaveValue(2);
  });

  it('aceita pico que cruza a meia-noite e oferece tags da equipe como sugestão', () => {
    const { container } = render(<CoverageEditor />);
    const options = [...container.querySelectorAll('#cov-tag-suggestions option')].map((o) => o.value);
    expect(options).toEqual(['Líder', 'Serra']);

    type('Início do pico na sexta', '22:00');
    type('Fim do pico na sexta', '02:00');
    type('Mínimo no pico na sexta', '2');
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar pico de horário na sexta' }));
    expect(store().coverageRules.find((r) => r.dayOfWeek === 'SEX').peakHours).toEqual([{ start: '22:00', end: '02:00', minStaff: 2 }]);
    expect(screen.getByText(/22:00–02:00 ≥ 2/)).toHaveTextContent('(vira o dia)');
  });

  it('"Aplicar a todos os dias" copia a segunda e a tabela navega com as setas', () => {
    render(<CoverageEditor />);
    type('Mínimo de pessoas na segunda', '1');
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar a todos os dias' }));
    expect(store().coverageRules).toHaveLength(7);

    const seg = screen.getByLabelText('Mínimo de pessoas na segunda');
    seg.focus();
    fireEvent.keyDown(seg, { key: 'ArrowDown' });
    expect(screen.getByLabelText('Mínimo de pessoas na terça')).toHaveFocus();
  });

  it('avisa meta impossível quando a soma excede 5 x ativos', () => {
    render(<CoverageEditor />);
    expect(screen.getByText(/Capacidade disponível: ≈ 2,1 pessoas por dia \(5\/7 × 3 ativos\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Meta impossível/)).not.toBeInTheDocument();

    for (const d of ['segunda', 'terça', 'quarta', 'quinta', 'sexta']) type(`Mínimo de pessoas na ${d}`, '3');
    expect(screen.queryByText(/Meta impossível/)).not.toBeInTheDocument(); // 15 = 5 x 3

    type('Mínimo de pessoas na sábado', '1');
    expect(screen.getByText(/Meta impossível/)).toBeInTheDocument();
  });
});
