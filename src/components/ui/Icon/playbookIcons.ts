import type { PlaybookType } from '@/types';
import sprite from '@/assets/playbook-icons.svg';

// Keep the artwork in a cacheable SVG asset instead of parsing it as JavaScript.
export const playbookIcons = {
  'blessed': { viewBox: '0 0 1940 2060', href: `${sprite}#blessed` },
  'lightbearer': { viewBox: '0 0 3880 3880', href: `${sprite}#lightbearer` },
  'would-be-hero': { viewBox: '0 0 3920 4560', href: `${sprite}#would-be-hero` },
  'seeker': { viewBox: '0 0 3920 3880', href: `${sprite}#seeker` },
  'ranger': { viewBox: '0 0 4000 3880', href: `${sprite}#ranger` },
  'marshal': { viewBox: '0 0 3880 3880', href: `${sprite}#marshal` },
  'judge': { viewBox: '0 0 3880 3880', href: `${sprite}#judge` },
  'heavy': { viewBox: '0 0 10240 10240', href: `${sprite}#heavy` },
  'fox': { viewBox: '0 0 10240 10240', href: `${sprite}#fox` },
} satisfies Record<PlaybookType, { viewBox: string; href: string }>;

export type PlaybookIconName = keyof typeof playbookIcons;
