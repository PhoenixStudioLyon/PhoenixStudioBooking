import { useEffect, useState } from 'react';

// Fire-and-forget toasts: toast('Saved'), toast('Oops', 'error')
export function toast(message, kind = 'ok') {
  window.dispatchEvent(new CustomEvent('toast', { detail: { message, kind, id: Math.random() } }));
}

export function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const on = (e) => {
      const t = e.detail;
      setItems((xs) => [...xs, t]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), 3200);
    };
    window.addEventListener('toast', on);
    return () => window.removeEventListener('toast', on);
  }, []);
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => <div key={t.id} className={`toast toast-${t.kind}`}>{t.message}</div>)}
    </div>
  );
}
