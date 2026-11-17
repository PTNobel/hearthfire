// Shared by the Crew sheet and the party inventory page.
export interface CrewInventoryItem {
  id: string;
  label: string;
  weight?: 1 | 2;
}

export const CREW_INVENTORY_ITEMS: CrewInventoryItem[] = [
  { id: "hatchet", label: "**Hatchet**, iron *(hand, thrown, x piercing)*" },
  { id: "spear", label: "**Spear**, iron *(close, thrown, x piercing)*" },
  {
    id: "bow",
    label: "**Bow & iron arrows** *(near, x piercing, ○ low ammo, ○ all out)*",
  },
  {
    id: "shield",
    label: "**Shield** *(+1 armor, +1 Readiness on a 7+ to Defend)*",
    weight: 2,
  },
  { id: "hides", label: "**Thick hides** *(1 armor, warm)*", weight: 2 },
  { id: "cloak", label: "**Cloak** *(warm)*" },
  {
    id: "supplies",
    label: "**Supplies** *(4+Prosperity uses per crew member)*",
  },
];

export const CREW_SIZE = 6;
