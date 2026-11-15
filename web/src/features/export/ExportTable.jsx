import { getWeekDates } from '@escala/shared/utils/dateUtils.js';
import { DAY_SHORT, SITE_LABEL, VIRAL_FOOTER, shortDate, weekRangeLabel } from './whatsappText.js';

const NAME_COL = 230;
const DAY_COL = 124;
export const EXPORT_TABLE_WIDTH = 32 + NAME_COL + DAY_COL * 7;

/** Texto escuro ou branco, conforme a luminância do fundo, para contraste alto. */
function textOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#0f172a' : '#ffffff';
}

const cellBase = {
  height: 46,
  textAlign: 'center',
  verticalAlign: 'middle',
  border: '1px solid #cbd5e1',
  fontSize: 20,
  fontWeight: 700,
};

/**
 * Tabela de exportação em alta legibilidade, com TODAS as linhas (sem virtualização).
 * @param {{ department: any, weekStartDate: string, employees: any[], shifts: any[], assignments: any[],
 *   watermark?: boolean, qrDataUrl?: string | null }} props
 */
export function ExportTable({ department, weekStartDate, employees, shifts, assignments, watermark = false, qrDataUrl = null }) {
  const dates = getWeekDates(weekStartDate);
  const cells = new Map(assignments.map((a) => [`${a.employeeId}|${a.date}`, a]));
  const shiftById = new Map(shifts.map((s) => [s.id, s]));
  const workCount = dates.map((date) =>
    employees.reduce((n, e) => n + (cells.get(`${e.id}|${date}`)?.type === 'WORK' ? 1 : 0), 0),
  );

  return (
    <div
      data-export-table
      style={{
        position: 'relative',
        width: EXPORT_TABLE_WIDTH,
        padding: 16,
        background: '#ffffff',
        color: '#0f172a',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 30, fontWeight: 800 }}>Escala {department?.name ?? ''}</div>
        <div style={{ fontSize: 22, fontWeight: 600, color: '#334155' }}>Semana {weekRangeLabel(weekStartDate)}</div>
      </div>

      <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th style={{ ...cellBase, width: NAME_COL, textAlign: 'left', paddingLeft: 8, background: '#0f172a', color: '#fff' }}>
              Funcionário
            </th>
            {dates.map((date, i) => (
              <th
                key={date}
                style={{ ...cellBase, width: DAY_COL, background: i === 6 ? '#be123c' : '#0f172a', color: '#fff', fontSize: 18, lineHeight: 1.2 }}
              >
                {DAY_SHORT[i]}
                <div style={{ fontSize: 16, fontWeight: 500 }}>{shortDate(date)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {employees.map((employee, row) => (
            <tr key={employee.id} style={{ background: row % 2 ? '#f8fafc' : '#ffffff' }}>
              <td
                style={{ ...cellBase, textAlign: 'left', paddingLeft: 8, fontSize: 19, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}
              >
                {employee.name}
              </td>
              {dates.map((date) => {
                const cell = cells.get(`${employee.id}|${date}`);
                const shift = cell?.type === 'WORK' ? shiftById.get(cell.shiftId) : null;
                if (shift) {
                  const color = shift.color || '#1d4ed8';
                  return (
                    <td key={date} style={{ ...cellBase, background: color, color: textOn(color) }}>
                      {shift.code}
                    </td>
                  );
                }
                if (cell?.type === 'ABSENCE') {
                  return (
                    <td key={date} style={{ ...cellBase, background: '#fef3c7', color: '#78350f', fontSize: 17 }}>
                      AUS
                    </td>
                  );
                }
                return (
                  <td key={date} style={{ ...cellBase, background: '#e2e8f0', color: '#334155', fontSize: 17 }}>
                    FOLGA
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ ...cellBase, textAlign: 'left', paddingLeft: 8, background: '#f1f5f9', fontSize: 17 }}>
              Trabalhando no dia
            </td>
            {workCount.map((n, i) => (
              <td key={dates[i]} style={{ ...cellBase, background: '#f1f5f9', fontSize: 20 }}>
                {n}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px', marginTop: 14, fontSize: 17 }}>
        {shifts.map((shift) => {
          const color = shift.color || '#1d4ed8';
          return (
            <span key={shift.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{ display: 'inline-block', minWidth: 38, padding: '2px 6px', borderRadius: 4, textAlign: 'center', fontWeight: 700, background: color, color: textOn(color) }}
              >
                {shift.code}
              </span>
              {shift.name} {shift.startTime}–{shift.endTime}
            </span>
          );
        })}
      </div>

      {watermark && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16, paddingTop: 12, borderTop: '2px solid #cbd5e1' }}>
          {qrDataUrl && <img src={qrDataUrl} alt="QR Code para planilhaescala5x2.com.br" width={88} height={88} />}
          <div style={{ fontSize: 18, fontWeight: 600, color: '#334155' }}>{VIRAL_FOOTER}</div>
        </div>
      )}

      {watermark && (
        <div aria-hidden="true" data-watermark style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          {[18, 42, 66, 90].map((top) => (
            <div
              key={top}
              style={{
                position: 'absolute',
                left: '-10%',
                width: '120%',
                top: `${top}%`,
                transform: 'rotate(-22deg)',
                textAlign: 'center',
                fontSize: 54,
                fontWeight: 800,
                letterSpacing: 2,
                color: 'rgba(15, 23, 42, 0.07)',
                whiteSpace: 'nowrap',
              }}
            >
              {SITE_LABEL}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
