import type { GmImprovement } from '@/types';

interface ImprovementOption {
  id: string;
  label: string;
  // When set, this option supersedes the option with id `replaces` once enabled —
  // the replaced option is hidden so only the upgrade shows (e.g. Stone Wall over Palisade).
  replaces?: string;
}

export interface SteadingImprovementListConfig {
  // Which SteadingData list field this section persists.
  fieldKey: 'resources' | 'fortifications';
  // Which gmImprovement category surfaces as auto-added extra items.
  gmCategory: GmImprovement['category'];
  fixedItems: string[];
  improvementItems: ImprovementOption[];
  addLabel: string;
  itemLabel: string;
}

export const RESOURCES_CONFIG: SteadingImprovementListConfig = {
  fieldKey: 'resources',
  gmCategory: 'resource',
  fixedItems: [
    'Farming (beans, potatoes, oats, barley)',
    'Hunting/trapping (fur, meat, hides)',
    'Distilling (whisky)',
    'Stone (collected from the Old Wall)',
    'Cistern (filled with rain, snow)',
    'Tradesfolk (midwife, potter, publican, smith, tanner)',
    "Trade: Gordin's Delve (metal, tools)",
    'Trade: Marshedge (textiles, herbs, glass)',
  ],
  improvementItems: [
    { id: 'aurochs-hunting', label: 'Aurochs hunting (meat, hide, horn)' },
    { id: 'harnessing-the-stream', label: 'Harnessing the Stream' },
    { id: 'inn', label: 'The Inn' },
    { id: 'mill', label: 'Mill' },
    { id: 'raincatching', label: 'Raincatching' },
  ],
  addLabel: 'Add resource',
  itemLabel: 'Custom resource',
};

export const FORTIFICATIONS_CONFIG: SteadingImprovementListConfig = {
  fieldKey: 'fortifications',
  gmCategory: 'fortification',
  fixedItems: [
    'Village militia',
    'The Ringwall (low, stone)',
    '3 watchtowers',
    'Spears & shields in every home',
    'Some bows',
  ],
  improvementItems: [
    { id: 'palisade', label: 'Palisade' },
    { id: 'standing-watch', label: 'Standing Watch' },
    { id: 'stone-wall', label: 'Stone Wall', replaces: 'palisade' },
    { id: 'weapons-of-war', label: 'Weapons of War' },
    { id: 'well-trained-militia', label: 'Well-Trained Militia' },
  ],
  addLabel: 'Add fortification',
  itemLabel: 'Custom fortification',
};
