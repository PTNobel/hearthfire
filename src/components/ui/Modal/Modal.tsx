import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import styles from './Modal.module.css';
import { focusTopModal, isTopModal, registerModal } from './modalStack';
import { useNotificationTarget } from '@/hooks/useNotificationTarget';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  'aria-labelledby': string;
}

export const Modal = ({ open, onClose, children, className, 'aria-labelledby': labelledBy }: ModalProps) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const notificationRef = useNotificationTarget(open, 2);
  const onCloseRef = useRef(onClose);
  const returnFocusRef = useRef<Element | null>(null);

  // avoids re-registering the keydown listener every time onClose changes identity
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    if (!panel) return;
    const unregister = registerModal(panel);

    returnFocusRef.current = document.activeElement;
    panelRef.current?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (!isTopModal(panel) || e.defaultPrevented) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (e.key !== 'Tab') return;

      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) { e.preventDefault(); return; }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      // If focus has escaped the panel entirely (e.g. inert unsupported in
      // older Safari/Firefox), pull it back to the first focusable element.
      if (!panel.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
        return;
      }

      if (e.shiftKey) {
        if (document.activeElement === first || document.activeElement === panel) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last || document.activeElement === panel) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      const wasTop = isTopModal(panel);
      unregister();
      if (wasTop) {
        const target = returnFocusRef.current;
        if (target instanceof HTMLElement && target.isConnected && !target.closest('[inert]')) target.focus();
        else focusTopModal();
      }
    };
  }, [open]);

  if (!open) return null;

  const handleBackdropClick = () => { if (isTopModal(panelRef.current)) onClose(); };
  const handlePanelClick = (e: React.MouseEvent) => e.stopPropagation();

  return createPortal(
    <div className={styles.backdrop} onClick={handleBackdropClick} role="none">
      <div
        ref={panelRef}
        className={clsx(styles.panel, className)}
        onClick={handlePanelClick}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
      >
        <div ref={notificationRef} className={styles.notifications} />
        {children}
      </div>
    </div>,
    document.body
  );
};
