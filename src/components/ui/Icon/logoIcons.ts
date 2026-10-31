import sprite from '@/assets/logo-icons.svg';

// Keep the artwork in a cacheable SVG asset instead of parsing it as JavaScript.
export const logoIcons = {
  'stonetop': { viewBox: '0 0 24000 24000', href: `${sprite}#stonetop` },
};

export type LogoIconName = keyof typeof logoIcons;
