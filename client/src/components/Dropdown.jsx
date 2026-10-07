import { useEffect, useRef, useState } from 'react';
import { LuChevronDown } from 'react-icons/lu';

// Small popover menu. items: [{label, onClick, danger, icon}]
export default function Dropdown({ label, icon, items, className = '', align = 'right', caret = true }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const on = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', on);
    return () => document.removeEventListener('mousedown', on);
  }, [open]);
  return (
    <div className={`dropdown ${className}`} ref={ref}>
      <button type="button" className="dd-trigger" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {icon}{label && <span className="dd-label">{label}</span>}{caret && <LuChevronDown className="dd-caret" />}
      </button>
      {open && (
        <div className={`dd-menu dd-${align}`}>
          {items.map((it, i) => (
            <button key={i} type="button" className={`dd-item ${it.danger ? 'danger' : ''} ${it.active ? 'active' : ''}`}
              onClick={() => { setOpen(false); it.onClick(); }}>
              {it.icon}{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
