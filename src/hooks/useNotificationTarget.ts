import { useEffect, useRef, useSyncExternalStore } from 'react';

// Notifications belong inside the active dialog/drawer so they cannot cover its
// buttons or sit outside its focus trap. Dialogs take precedence over drawers.
const targets: { element: HTMLDivElement; priority: number }[] = [];
const listeners = new Set<() => void>();
const getTarget = () => targets.reduce<(typeof targets)[number] | null>(
  (top, next) => !top || next.priority >= top.priority ? next : top, null,
)?.element ?? null;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const emit = () => listeners.forEach((listener) => listener());

export const useActiveNotificationTarget = () => useSyncExternalStore(subscribe, getTarget, () => null);

export const useNotificationTarget = (open: boolean, priority: number) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !ref.current) return;
    const target = { element: ref.current, priority };
    targets.push(target);
    emit();
    return () => {
      targets.splice(targets.indexOf(target), 1);
      emit();
    };
  }, [open, priority]);
  return ref;
};
