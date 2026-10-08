import { useEffect, useRef, useState } from 'react';
import { LuCalendarDays, LuChevronLeft, LuChevronRight } from 'react-icons/lu';
import { fromYMD, toYMD, todayYMD, MONTH_LONG } from '../dates.js';

// Date field that always shows dd/mm/yyyy, whatever the browser language (the browser's own date input
// follows the browser language, e.g. mm/dd/yyyy in US English). value / onChange use "YYYY-MM-DD".
const pad = (n) => String(n).padStart(2, '0');
const toDisplay = (ymd) => (ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}` : '');
function parseDisplay(text) {
  const m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? toYMD(date) : null;
}
// Typing helper: keeps digits and adds the slashes (08102026 -> 08/10/2026)
function autoFormat(text) {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('/');
}

export default function DateField({ value, onChange, className = '' }) {
  const [text, setText] = useState(toDisplay(value));
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => (value || todayYMD()).slice(0, 7)); // "YYYY-MM" shown in the popup
  const box = useRef(null);

  useEffect(() => { setText(toDisplay(value)); }, [value]);
  useEffect(() => {
    if (!open) return;
    const outside = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } }; // don't close the dialog too
    document.addEventListener('mousedown', outside);
    window.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', outside); window.removeEventListener('keydown', esc, true); };
  }, [open]);

  const type = (e) => {
    const t = autoFormat(e.target.value);
    setText(t);
    const ymd = parseDisplay(t);
    if (ymd) { onChange(ymd); setMonth(ymd.slice(0, 7)); }
  };
  const pick = (ymd) => { onChange(ymd); setOpen(false); };

  // month grid, weeks starting on Monday
  const first = fromYMD(`${month}-01`);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${pad(i + 1)}`)];
  const shift = (n) => { const d = new Date(first.getFullYear(), first.getMonth() + n, 1); setMonth(toYMD(d).slice(0, 7)); };
  const today = todayYMD();

  return (
    <div className={`date-field ${className}`} ref={box}>
      <input className="input" inputMode="numeric" placeholder="dd/mm/yyyy" value={text} onChange={type}
        onBlur={() => setText(toDisplay(value))} aria-label="Date (dd/mm/yyyy)" />
      <button type="button" className="df-btn" onClick={() => { setMonth((value || today).slice(0, 7)); setOpen((o) => !o); }}
        aria-label="Choose a date"><LuCalendarDays /></button>
      {open && (
        <div className="df-pop" role="dialog" aria-label="Choose a date">
          <div className="df-head">
            <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label="Previous month"><LuChevronLeft /></button>
            <strong>{MONTH_LONG[first.getMonth()]} {first.getFullYear()}</strong>
            <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label="Next month"><LuChevronRight /></button>
          </div>
          <div className="df-grid">
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => <span key={d} className="df-dow">{d}</span>)}
            {cells.map((ymd, i) => ymd ? (
              <button type="button" key={ymd} onClick={() => pick(ymd)}
                className={`df-day ${ymd === value ? 'on' : ''} ${ymd === today ? 'today' : ''}`}>{Number(ymd.slice(8))}</button>
            ) : <span key={`x${i}`} />)}
          </div>
          <button type="button" className="link link-btn df-today" onClick={() => pick(today)}>Today</button>
        </div>
      )}
    </div>
  );
}
