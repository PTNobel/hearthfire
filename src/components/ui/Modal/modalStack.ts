const panels: HTMLElement[] = [];
let appRoot: HTMLElement | null = null;
let rootWasInert = false;
let previousOverflow = '';

export const isTopModal = (panel: HTMLElement | null) => panel === panels[panels.length - 1];

export const registerModal = (panel: HTMLElement) => {
  if (panels.length === 0) {
    appRoot = document.getElementById('root');
    rootWasInert = appRoot?.hasAttribute('inert') ?? false;
    appRoot?.setAttribute('inert', '');
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  const previous = panels[panels.length - 1];
  previous?.parentElement?.setAttribute('inert', '');
  previous?.parentElement?.removeAttribute('data-active-modal');
  panels.push(panel);
  panel.parentElement?.setAttribute('data-active-modal', '');

  return () => {
    const wasTop = isTopModal(panel);
    panels.splice(panels.indexOf(panel), 1);
    if (panels.length === 0) {
      if (!rootWasInert) appRoot?.removeAttribute('inert');
      document.body.style.overflow = previousOverflow;
      appRoot = null;
    } else if (wasTop) {
      panels[panels.length - 1]?.parentElement?.removeAttribute('inert');
      panels[panels.length - 1]?.parentElement?.setAttribute('data-active-modal', '');
    }
  };
};

export const focusTopModal = () => panels[panels.length - 1]?.focus();
