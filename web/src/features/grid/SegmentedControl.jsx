import { useRef } from 'react';

/**
 * Controle segmentado acessível (radiogroup): setas movem e selecionam, Home/End vão às pontas.
 * @param {{ label: string, value: string, options: { value: string, label: string, Icon?: any }[], onChange: (value: string) => void }} props
 */
export function SegmentedControl({ label, value, options, onChange }) {
  const refs = useRef({});

  const onKeyDown = (e) => {
    const i = options.findIndex((o) => o.value === value);
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = options[(i + 1) % options.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = options[(i - 1 + options.length) % options.length];
    else if (e.key === 'Home') next = options[0];
    else if (e.key === 'End') next = options[options.length - 1];
    if (!next) return;
    e.preventDefault();
    onChange(next.value);
    refs.current[next.value]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="inline-flex w-fit shrink-0 self-start rounded-lg border border-slate-300 bg-slate-100 p-0.5">
      {options.map(({ value: optionValue, label: text, Icon }) => {
        const selected = optionValue === value;
        return (
          <button
            key={optionValue}
            ref={(el) => {
              refs.current[optionValue] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(optionValue)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-600 ${
              selected ? 'bg-white font-semibold text-emerald-900 shadow-sm ring-1 ring-emerald-600' : 'text-slate-700 hover:bg-slate-200'
            }`}
          >
            {Icon && <Icon size={16} aria-hidden="true" />}
            {text}
          </button>
        );
      })}
    </div>
  );
}
