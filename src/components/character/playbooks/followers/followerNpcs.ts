import type { FollowerData, GameSession, SteadingNPC, SteadingNpcForm } from '@/types';

export interface FollowerNpcs {
  game: GameSession;
  characterId: string;
  create: (follower: FollowerData, npc: SteadingNPC) => Promise<void>;
  update: (npcId: string, before: SteadingNpcForm, after: SteadingNpcForm) => Promise<void>;
}
