import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useScheduleStore, getCurrentMonday } from '../../store/useScheduleStore.js';
import { formatWeekRange } from './gridUtils.js';
import { currentMonthKey, formatMonthLabel } from './monthUtils.js';

const navBtn =
  'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600';
const todayBtn =
  'h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600';

/** Navegação do cabeçalho: semana a semana no modo Semana, mês a mês no modo Mês. */
export function PeriodNav() {
  const viewMode = useScheduleStore((s) => s.viewMode);
  const weekStart = useScheduleStore((s) => s.currentWeekStart);
  const month = useScheduleStore((s) => s.currentMonth);
  const prevWeek = useScheduleStore((s) => s.prevWeek);
  const nextWeek = useScheduleStore((s) => s.nextWeek);
  const goToWeek = useScheduleStore((s) => s.goToWeek);
  const prevMonth = useScheduleStore((s) => s.prevMonth);
  const nextMonth = useScheduleStore((s) => s.nextMonth);
  const goToMonth = useScheduleStore((s) => s.goToMonth);

  const isMonth = viewMode === 'month';
  const unit = isMonth ? 'mês' : 'semana';
  return (
    <div className="ml-auto flex items-center gap-1.5" role="group" aria-label={isMonth ? 'Navegação de mês' : 'Navegação de semana'}>
      <button type="button" className={navBtn} onClick={isMonth ? prevMonth : prevWeek} aria-label={isMonth ? 'Mês anterior' : 'Semana anterior'}>
        <ChevronLeft size={16} aria-hidden="true" />
      </button>
      <p
        className={`text-center text-sm font-semibold tabular-nums text-slate-900 ${isMonth ? 'min-w-[8.5rem] first-letter:uppercase' : 'min-w-[10.5rem]'}`}
        aria-live="polite"
        data-testid={isMonth ? 'month-label' : 'week-range'}
      >
        {isMonth ? formatMonthLabel(month) : formatWeekRange(weekStart)}
      </p>
      <button type="button" className={navBtn} onClick={isMonth ? nextMonth : nextWeek} aria-label={isMonth ? 'Próximo mês' : 'Próxima semana'}>
        <ChevronRight size={16} aria-hidden="true" />
      </button>
      <button type="button" onClick={() => (isMonth ? goToMonth(currentMonthKey()) : goToWeek(getCurrentMonday()))} className={todayBtn} title={`Ir para o ${unit} atual`}>
        Hoje
      </button>
    </div>
  );
}
