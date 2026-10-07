import { useEffect, useRef } from 'react';
import { LuX } from 'react-icons/lu';

// Open modals, newest last: Escape only closes the one on top (modals can open over each other)
const stack = [];

// Picktime-style modal: title on the left, action buttons on the right of the header
export default function Modal({ title, actions, onClose, children, footer, width = 760 }) {
  const me = useRef({});
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const token = me.current;
    stack.push(token);
    const on = (e) => { if (e.key === 'Escape' && stack[stack.length - 1] === token) closeRef.current?.(); };
    window.addEventListener('keydown', on);
    return () => { window.removeEventListener('keydown', on); stack.splice(stack.indexOf(token), 1); };
  }, []);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="modal" style={{ maxWidth: width }} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          <div className="modal-actions">
            {actions}
            {onClose && <button className="icon-btn close-x" onClick={onClose} aria-label="Close"><LuX /></button>}
          </div>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({ title = 'Are you sure?', message, confirmLabel = 'Confirm', danger, onConfirm, onClose }) {
  return (
    <Modal title={title} onClose={onClose} width={440}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>{confirmLabel}</button>
      </>}>
      <p className="confirm-msg">{message}</p>
    </Modal>
  );
}
