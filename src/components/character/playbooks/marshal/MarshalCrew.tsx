import { useState, useCallback, useMemo, memo } from "react";
import { useLatest } from "@/hooks/useLatest";
import { useFirestoreSync } from "@/hooks/useFirestoreSync";
import { usePlaybookField } from "@/hooks/usePlaybookField";
import {
  Checkbox,
  CheckboxGroup,
  Button,
  Dropdown,
  Divider,
  Input,
  Text,
  UseDots,
} from "@/components/ui";
import { useToast } from "@/components/app";
import { PlaybookSection } from '@/components/playbook/PlaybookSection';
import {
  resolvePlaybookFeatures,
  featurePatch,
} from "@/lib/resolvePlaybookFeatures";
import { OptionSelect } from "../../sections/OptionSelect";
import { toCustomSentinel } from "../../sections/OptionSelectUtils";
import type { RadioOption, GameSession, SteadingNPC, SteadingNpcForm } from "@/types";
import type { DropdownGroup } from "@/components/ui";
import { NpcModal } from '@/components/gm-playbook/sections/SteadingNPCs/NpcModal';
import { buildGroups } from '@/components/gm-playbook/sections/SteadingNPCs/npcData';
import type { NpcFormState } from '@/components/gm-playbook/sections/SteadingNPCs/npcData';
import {
  BACKGROUND_FORCED_MOVES,
  BACKGROUND_GRANTED_CREW_TAGS,
} from "@/lib/moves";
import { useCrewSave } from "../shared/useCrewSave";
import { useTrackedField } from "../shared/useTrackedField";
import { StatBox, LoyaltyRow, CustomItemsGrid } from "../shared/CrewWidgets";
import type { PlaybookSectionProps } from "@/types";
import styles from "./MarshalCrew.module.css";

const CREW_HP_BASE = 6;
const CREW_DAMAGE_DICE = ["d6", "d8", "d10"] as const;
const CREW_SIZE = 6;

const TAG_ITEMS = [
  { id: "archers", label: "archers" },
  { id: "athletic", label: "athletic" },
  { id: "brave", label: "brave" },
  { id: "cunning", label: "cunning" },
  { id: "devoted", label: "devoted" },
  { id: "hardy", label: "hardy" },
  { id: "intimidating", label: "intimidating" },
  { id: "observant", label: "observant" },
  { id: "patient", label: "patient" },
  { id: "respected", label: "respected" },
  { id: "stealthy", label: "stealthy" },
  { id: "warriors", label: "warriors" },
];

const INSTINCT_OPTIONS: RadioOption[] = [
  {
    value: "To bicker, infight, and hold grudges",
    label: "To bicker, infight, and hold grudges",
    description: "",
  },
  {
    value: "To hew to tradition and superstition",
    label: "To hew to tradition and superstition",
    description: "",
  },
  {
    value: "To indulge their baser instincts",
    label: "To indulge their baser instincts",
    description: "",
  },
  {
    value: "To lord over others",
    label: "To lord over others",
    description: "",
  },
  {
    value: "To take needless risks",
    label: "To take needless risks",
    description: "",
  },
  {
    value: "To take things too far",
    label: "To take things too far",
    description: "",
  },
];

const COST_OPTIONS: RadioOption[] = [
  {
    value: "Merry-making, as a group",
    label: "Merry-making, as a group",
    description: "",
  },
  {
    value: "Public recognition and respect, honor",
    label: "Public recognition and respect, honor",
    description: "",
  },
  {
    value: "Risks taken, by you, to help them",
    label: "Risks taken, by you, to help them",
    description: "",
  },
  {
    value: "Victories won against worthy foes",
    label: "Victories won against worthy foes",
    description: "",
  },
  {
    value: "Wealth gained for themselves or Stonetop",
    label: "Wealth gained for themselves or Stonetop",
    description: "",
  },
];

interface InventoryItem {
  id: string;
  label: string;
  weight?: 1 | 2;
}

const INVENTORY_ITEMS: InventoryItem[] = [
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

const INDIVIDUALS_COUNT = 6;
const CUSTOM_ITEM_INDICES = [0, 1, 2, 3];
// Two fixed, in-place-edited custom-tag slots. Stable ids (not the iteration
// index) key the inputs so state never mismatches the wrong slot.
const CUSTOM_TAG_SLOT_IDS = ["custom-tag-a", "custom-tag-b"] as const;

const normalizeCustomItems = (
  raw: { checked: boolean; text: string }[] | undefined,
): { checked: boolean; text: string }[] =>
  Array.from(
    { length: CUSTOM_ITEM_INDICES.length * 2 },
    (_, i) => raw?.[i] ?? { checked: false, text: "" },
  );

interface InventoryRowProps {
  item: InventoryItem;
  checked: boolean;
  onCheckedChange: (id: string, checked: boolean) => void;
}

const InventoryRow = memo(
  ({ item, checked, onCheckedChange }: InventoryRowProps) => {
    const handleChecked = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) =>
        onCheckedChange(item.id, e.target.checked),
      [item.id, onCheckedChange],
    );
    return (
      <div className={styles.inventoryItem}>
        <Checkbox
          variant="provision"
          weight={item.weight ?? 1}
          checked={checked}
          onChange={handleChecked}
          label={
            <Text as="span" className={styles.inventoryLabel}>
              {item.label}
            </Text>
          }
        />
      </div>
    );
  },
);

interface IndividualSlotProps {
  index: number;
  name: string;
  linkedName?: string;
  linkedTraits?: string;
  npcControls?: React.ReactNode;
  tag: string;
  traits: string;
  onChange: (
    index: number,
    field: "name" | "tag" | "traits",
    val: string,
  ) => void;
  onBlur: () => void;
}

const IndividualSlot = memo(
  ({ index, name, linkedName, linkedTraits, npcControls, tag, traits, onChange, onBlur }: IndividualSlotProps) => {
    const handleName = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) =>
        onChange(index, "name", e.target.value),
      [index, onChange],
    );
    const handleTag = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) =>
        onChange(index, "tag", e.target.value),
      [index, onChange],
    );
    const handleTraits = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) =>
        onChange(index, "traits", e.target.value),
      [index, onChange],
    );

    return (
      <div className={styles.individual}>
        <div className={styles.individualFields}>
          <Input
            className={styles.individualInput}
            type="text"
            value={linkedName ?? name}
            readOnly={linkedName !== undefined}
            placeholder="Name"
            aria-label={`Individual ${index + 1} name`}
            title={linkedName !== undefined ? 'Edit the name through the linked Steading NPC' : undefined}
            onChange={handleName}
            onBlur={linkedName !== undefined ? undefined : onBlur}
          />
          <Input
            className={styles.individualInput}
            type="text"
            value={tag}
            placeholder="Tag"
            aria-label={`Individual ${index + 1} tag`}
            onChange={handleTag}
            onBlur={onBlur}
          />
        </div>
        <Input
          multiline
          className={styles.individualTraits}
          value={linkedTraits ?? traits}
          readOnly={linkedTraits !== undefined}
          placeholder="Traits"
          aria-label={`Individual ${index + 1} traits`}
          title={linkedTraits !== undefined ? 'Edit traits through the linked Steading NPC' : undefined}
          rows={2}
          onChange={handleTraits}
          onBlur={linkedTraits !== undefined ? undefined : onBlur}
        />
        {npcControls}
      </div>
    );
  },
);

interface SuppliesMemberDotsProps {
  memberIndex: number;
  total: number;
  checked: number;
  onChange: (memberIndex: number, n: number) => void;
}

const SuppliesMemberDots = memo(
  ({ memberIndex, total, checked, onChange }: SuppliesMemberDotsProps) => {
    const handleChange = useCallback(
      (n: number) => onChange(memberIndex, n),
      [memberIndex, onChange],
    );
    return (
      <UseDots
        total={total}
        checked={checked}
        onChange={handleChange}
        ariaLabel={`Supplies, individual ${memberIndex + 1}`}
      />
    );
  },
);

type Individual = { name: string; tag: string; traits: string };

const EMPTY_INDIVIDUAL: Individual = { name: "", tag: "", traits: "" };

const defaultIndividuals = (): Individual[] =>
  Array.from({ length: INDIVIDUALS_COUNT }, () => ({ ...EMPTY_INDIVIDUAL }));

const parseIndividuals = (raw: unknown): Individual[] => {
  if (!Array.isArray(raw)) return defaultIndividuals();
  const filled = (raw as Individual[]).map((s) => ({
    name: s?.name ?? "",
    tag: s?.tag ?? "",
    traits: s?.traits ?? "",
  }));
  while (filled.length < INDIVIDUALS_COUNT)
    filled.push({ ...EMPTY_INDIVIDUAL });
  return filled.slice(0, INDIVIDUALS_COUNT);
};

interface MarshalCrewProps extends PlaybookSectionProps {
  prosperity: number;
  game: GameSession;
  characterId: string;
  onLinkNpc: (slot: number, id: string | null) => Promise<void>;
  onCreateNpc: (slot: number, npc: SteadingNPC) => Promise<void>;
  onEditNpc: (npcId: string, original: SteadingNpcForm, next: SteadingNpcForm) => Promise<void>;
}

export const MarshalCrew = ({ data, prosperity, onSave, game, characterId, onLinkNpc, onCreateNpc, onEditNpc }: MarshalCrewProps) => {
  const { addToast } = useToast();
  const features = resolvePlaybookFeatures(data);

  const hasHeroesToTheLast =
    data?.typeMoves?.["marshal-heroes-to-the-last"] === true;
  const backgroundForcedMoves = data?.background
    ? (BACKGROUND_FORCED_MOVES.marshal?.[data.background] ?? [])
    : [];
  // Veteran Crew can be background-forced without ever being written to
  // typeMoves, so check both. The checklist reads below are gated by this flag
  // because deselecting a move leaves its checklist state behind in Firestore.
  const hasVeteranCrew =
    data?.typeMoves?.["marshal-veteran-crew"] === true ||
    backgroundForcedMoves.includes("marshal-veteran-crew");

  const hasVeteranDamage = hasVeteranCrew &&
    data?.typeMoveCheckList?.["marshal-veteran-crew"]?.["marshal-vc-damage"] === true;
  const hasVeteranHp = hasVeteranCrew &&
    data?.typeMoveCheckList?.["marshal-veteran-crew"]?.["marshal-vc-hp"] === true;
  const hasHeroesDamage = hasHeroesToTheLast &&
    data?.typeMoveCheckList?.["marshal-heroes-to-the-last"]?.["marshal-httl-damage"] === true;
  const hasHeroesHp = hasHeroesToTheLast &&
    data?.typeMoveCheckList?.["marshal-heroes-to-the-last"]?.["marshal-httl-hp"] === true;

  const crewHpMax = CREW_HP_BASE + (hasVeteranHp ? 2 : 0) + (hasHeroesHp ? 4 : 0);
  const damageSteps = (hasVeteranDamage ? 1 : 0) + (hasHeroesDamage ? 1 : 0);
  const crewDamage = CREW_DAMAGE_DICE[Math.min(damageSteps, CREW_DAMAGE_DICE.length - 1)];

  const [customItems, setCustomItems] = useState<
    { checked: boolean; text: string }[]
  >(() => normalizeCustomItems(features.crewCustomItems));
  const [individuals, setIndividuals] = useState<Individual[]>(() =>
    parseIndividuals(features.crewIndividuals),
  );

  const customItemsRef = useLatest(customItems);
  const individualsRef = useLatest(individuals);

  const npcLinks = features.crewNpcLinks ?? {};
  const [npcModal, setNpcModal] = useState<{ slot: number; mode: 'create' | 'edit' } | null>(null);
  const [linkBusy, setLinkBusy] = useState<number | null>(null);
  const npcById = useMemo(() => new Map(
    [...(game.steading?.residents ?? []), ...(game.steading?.neighbors ?? [])]
      .map((npc) => [npc.id, npc] as const),
  ), [game.steading?.residents, game.steading?.neighbors]);
  const linkedIds = new Set(
    Object.values(npcLinks).filter((id): id is string => typeof id === 'string' && id.length > 0),
  );
  const npcGroups: DropdownGroup<string>[] = [
    {
      label: 'Stonetop Residents',
      options: (game.steading?.residents ?? [])
        .filter((npc) => !linkedIds.has(npc.id))
        .map((npc) => ({ value: npc.id, label: npc.name })),
    },
    {
      label: 'Notable Neighbors',
      options: (game.steading?.neighbors ?? [])
        .filter((npc) => !linkedIds.has(npc.id))
        .map((npc) => ({ value: npc.id, label: npc.name })),
    },
  ].filter((group) => group.options.length > 0);

  const relationshipGroups = useMemo(
    () => buildGroups(game),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game.characters, game.steading?.residents, game.steading?.neighbors],
  );
  const modalNpcId = npcModal ? npcLinks[String(npcModal.slot)] : undefined;
  const modalNpc = modalNpcId ? npcById.get(modalNpcId) : undefined;
  const modalGroups = modalNpc ? relationshipGroups
    .map((group) => ({
      ...group, options: group.options.filter((opt) => !opt.value.endsWith(`::${modalNpc.id}`)),
    })).filter((group) => group.options.length > 0)
    : relationshipGroups;
  const modalInitial: NpcFormState | undefined = npcModal?.mode === 'edit' && modalNpc
    ? {
        name: modalNpc.name, pronouns: modalNpc.pronouns ?? '',
        occupation: modalNpc.occupation ?? '', traits: modalNpc.traits ?? [],
        relationships: modalNpc.relationships ?? [], notes: modalNpc.notes ?? '',
      }
    : npcModal?.mode === 'create'
      ? {
          name: individuals[npcModal.slot]?.name ?? '',
          pronouns: '', occupation: 'Soldier',
          traits: individuals[npcModal.slot]?.traits.trim()
            ? [individuals[npcModal.slot].traits.trim()] : [],
          relationships: [], notes: '',
        }
      : undefined;

  const handleLinkNpc = useCallback((slot: number, id: string | null) => {
    setLinkBusy(slot);
    void onLinkNpc(slot, id).catch(() => {
      addToast('Could not link this crew member. Check save status and retry.', 'error');
    }).finally(() => setLinkBusy(null));
  }, [onLinkNpc, addToast]);
  const handleCreateNpc = useCallback((slot: number) => setNpcModal({ slot, mode: 'create' }), []);
  const handleEditNpc = useCallback((slot: number) => setNpcModal({ slot, mode: 'edit' }), []);
  const handleCloseNpc = useCallback(() => setNpcModal(null), []);
  const handleSaveNpc = useCallback((form: NpcFormState, original: NpcFormState, id: string) => {
    if (!npcModal) return Promise.reject(new Error('NPC form closed.'));
    if (npcModal.mode === 'create') {
      // The modal provides one stable ID across retries; creation and link are
      // accepted as one durable batch, with no partly-created records.
      return onCreateNpc(npcModal.slot, { id, ...form });
    }
    if (!modalNpc) return Promise.reject(new Error('Linked NPC no longer exists.'));
    return onEditNpc(modalNpc.id, original, form);
  }, [npcModal, modalNpc, onCreateNpc, onEditNpc]);

  const { saveDebounced, saveImmediate, flushDebounce, dataRef, onSaveRef, pendingRef } =
    useCrewSave(data, onSave);

  // Each call independently mirrors one remote Firestore subfield into optimistic
  // local state, deferring the echo while a save from that field (or any other,
  // via the shared pendingRef) is in flight. See useFirestoreSync for the guard.
  useFirestoreSync(features.crewCustomItems, (v) => { if (v !== undefined) setCustomItems(normalizeCustomItems(v)); }, pendingRef);
  useFirestoreSync(features.crewIndividuals, (v) => { if (v !== undefined) setIndividuals(parseIndividuals(v)); }, pendingRef);

  const {
    value: suppliesUses,
    ref: suppliesUsesRef,
    save: saveSuppliesUses,
  } = usePlaybookField(
    "crewSuppliesUses",
    features.crewSuppliesUses ?? Array(CREW_SIZE).fill(0),
    saveImmediate,
    "Failed to save.",
  );

  const { value: hp, setValue: setHp, handleBlur: handleHpBlur } =
    useTrackedField(features.crewHp ?? String(CREW_HP_BASE), "crewHp", saveDebounced, flushDebounce);

  const handleHpChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (raw === "") {
        setHp(raw);
        saveDebounced({ crewHp: raw });
        return;
      }
      const n = parseInt(raw, 10);
      if (!isNaN(n)) {
        const val = String(Math.max(0, Math.min(n, crewHpMax)));
        setHp(val);
        saveDebounced({ crewHp: val });
      }
    },
    [setHp, saveDebounced, crewHpMax],
  );

  const { value: armor, handleChange: handleArmorChange, handleBlur: handleArmorBlur } =
    useTrackedField(features.crewArmor ?? "0", "crewArmor", saveDebounced, flushDebounce);

  const [tagsCustom, setTagsCustom] = useState<string[]>(() =>
    (features.crewTagsCustom ?? ["", ""]).slice(0, 2),
  );
  const tagsCustomRef = useLatest(tagsCustom);
  useFirestoreSync(features.crewTagsCustom, (v) => { if (v !== undefined) setTagsCustom(v.slice(0, 2)); }, pendingRef);

  const handleTagCustomChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const i = Number(e.currentTarget.dataset.index);
      const val = e.currentTarget.value;
      const next = [...tagsCustomRef.current];
      next[i] = val;
      setTagsCustom(next);
      saveDebounced({ crewTagsCustom: next }, () =>
        addToast("Failed to save.", "error"),
      );
    },
    [tagsCustomRef, saveDebounced, addToast],
  );

  const handleTagCustomBlur = useCallback(() => {
    flushDebounce({ crewTagsCustom: tagsCustomRef.current }).catch(() =>
      addToast("Failed to save.", "error"),
    );
  }, [flushDebounce, tagsCustomRef, addToast]);

  const { value: tagsRaw, ref: tagsRef, save: saveTags } = usePlaybookField(
    "crewTags",
    features.crewTags ?? {},
    saveImmediate,
    "Failed to save.",
  );
  const tags: Record<string, boolean> = { group: true, ...tagsRaw };

  const { value: loyalty, save: saveLoyalty } = usePlaybookField(
    "crewLoyalty",
    features.crewLoyalty ?? 0,
    saveImmediate,
    "Failed to save.",
  );

  const { value: inventoryChecked, ref: inventoryCheckedRef, save: saveInventoryChecked } =
    usePlaybookField(
      "crewInventoryChecked",
      features.crewInventoryChecked ?? {},
      saveImmediate,
      "Failed to save.",
    );

  const handleTagChange = useCallback(
    (id: string, checked: boolean) => {
      if (id === "group") return;
      saveTags({ ...tagsRef.current, [id]: checked });
    },
    [saveTags, tagsRef],
  );

  const handleLoyaltyChange = useCallback(
    (n: number) => {
      saveLoyalty(n);
    },
    [saveLoyalty],
  );

  const handleInventoryCheckedChange = useCallback(
    (id: string, val: boolean) => {
      saveInventoryChecked({ ...inventoryCheckedRef.current, [id]: val });
    },
    [saveInventoryChecked, inventoryCheckedRef],
  );

  const handleCustomItemChecked = useCallback(
    (slotIndex: number, checked: boolean) => {
      const prev = customItemsRef.current;
      const next = prev.map((item, i) =>
        i === slotIndex ? { ...item, checked } : item,
      );
      setCustomItems(next);
      saveImmediate({ crewCustomItems: next }).catch(() => {
        setCustomItems(prev);
        addToast("Failed to save.", "error");
      });
    },
    [saveImmediate, addToast, customItemsRef],
  );

  const handleCustomItemText = useCallback(
    (slotIndex: number, text: string) => {
      const next = customItemsRef.current.map((item, i) =>
        i === slotIndex ? { ...item, text, checked: text.length > 0 } : item,
      );
      setCustomItems(next);
      saveDebounced({ crewCustomItems: next }, () =>
        addToast("Failed to save.", "error"),
      );
    },
    [saveDebounced, addToast, customItemsRef],
  );

  const handleCustomItemBlur = useCallback(() => {
    flushDebounce({ crewCustomItems: customItemsRef.current }).catch(() =>
      addToast("Failed to save.", "error"),
    );
  }, [flushDebounce, addToast, customItemsRef]);

  const handleSuppliesUsesChange = useCallback(
    (memberIndex: number, n: number) => {
      const next = [...suppliesUsesRef.current];
      next[memberIndex] = n;
      saveSuppliesUses(next);
    },
    [saveSuppliesUses, suppliesUsesRef],
  );

  const handleIndividualChange = useCallback(
    (index: number, field: "name" | "tag" | "traits", val: string) => {
      const next = individualsRef.current.map((ind, i) =>
        i === index ? { ...ind, [field]: val } : ind,
      );
      setIndividuals(next);
      saveDebounced({ crewIndividuals: next }, () =>
        addToast("Failed to save.", "error"),
      );
    },
    [saveDebounced, addToast, individualsRef],
  );

  const handleIndividualBlur = useCallback(() => {
    flushDebounce({ crewIndividuals: individualsRef.current }).catch(() =>
      addToast("Failed to save.", "error"),
    );
  }, [flushDebounce, addToast, individualsRef]);

  const handleCrewInstinctSave = useCallback(
    (value: string, customValue: string) => {
      return onSave(
        featurePatch(data, {
          crewInstinct: value,
          crewInstinctCustom: customValue,
        }),
      );
    },
    [data, onSave],
  );

  const handleCrewCostSave = useCallback(
    (value: string, customValue: string) => {
      return onSave(
        featurePatch(data, {
          crewCost: value,
          crewCostCustom: customValue,
        }),
      );
    },
    [data, onSave],
  );

  const isExceptional =
    data?.typeMoveCheckList?.["marshal-heroes-to-the-last"]?.[
      "marshal-httl-exceptional"
    ] === true;
  const grantedTag = data?.background
    ? BACKGROUND_GRANTED_CREW_TAGS.marshal?.[data.background]
    : undefined;
  const hasVeteranTags =
    hasVeteranCrew &&
    data?.typeMoveCheckList?.["marshal-veteran-crew"]?.["marshal-vc-tags"] ===
      true;
  const maxTags = hasVeteranTags ? 4 : 2;
  const selectedTagCount = Object.entries(tags).filter(
    ([id, v]) =>
      id !== "group" && id !== "exceptional" && id !== grantedTag && v,
  ).length;
  const tagAtMax = selectedTagCount >= maxTags;
  // Possible when the limit shrinks under existing picks (e.g. the Veteran
  // Crew tags option is unchecked after 4 tags were already selected).
  const overLimitTagCount = selectedTagCount - maxTags;
  const tagItemsWithDisable = TAG_ITEMS.map((item) => ({
    ...item,
    disabled:
      item.id === "group" ||
      item.id === grantedTag ||
      (!tags[item.id] && tagAtMax),
  }));
  const tagsChecked = {
    ...tags,
    group: true,
    ...(grantedTag ? { [grantedTag]: true } : {}),
  };

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur(),
    [],
  );
  const handleExceptionalChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.checked;
      // typeMoveCheckList lives on CharacterData directly, not in playbookFeatures, so we bypass featurePatch.
      // updateCharacterData shallow-merges the patch onto c.data, so spreading the existing sub-objects is required.
      const prev = dataRef.current?.typeMoveCheckList ?? {};
      const next = {
        ...prev,
        "marshal-heroes-to-the-last": {
          ...prev["marshal-heroes-to-the-last"],
          "marshal-httl-exceptional": val,
        },
      };
      onSaveRef.current({ typeMoveCheckList: next }).catch(() => {
        // isExceptional is derived from data prop — Firestore will revert it on the next snapshot.
        // We only need to surface the failure; no local state to roll back here.
        addToast("Failed to save.", "error");
      });
    },
    [addToast, dataRef, onSaveRef],
  );

  return (
    <div className={styles.root}>
      <PlaybookSection title="Crew">
        <Text font="serif" color="muted" leading="normal">
          Your Crew is a half-dozen strong by default. Treat them as a follower
          with the *group* tag. All starting values here are subject to change
          in play.
        </Text>
        <div className={styles.infoBoxes}>
          <StatBox
            ariaLabel="Crew HP"
            value={hp}
            inputProps={{ min: 0, max: crewHpMax }}
            onChange={handleHpChange}
            onBlur={handleHpBlur}
            onWheel={handleWheel}
            label={
              <>HP <Text as="span" size="xs" color="muted" italic>Max [{crewHpMax}]</Text></>
            }
          />
          <StatBox
            ariaLabel="Crew armor"
            value={armor}
            inputProps={{ min: 0 }}
            onChange={handleArmorChange}
            onBlur={handleArmorBlur}
            onWheel={handleWheel}
            label={
              <>Armor <Text as="span" size="xs" color="muted" italic>(starts at 0)</Text></>
            }
          />
          <StatBox
            ariaLabel="Crew damage"
            staticValue={crewDamage}
            label={
              <>Damage <Text as="span" size="xs" color="muted" italic>(starts at d6)</Text></>
            }
          />
        </div>
      </PlaybookSection>

      <PlaybookSection title="Tags">
        <Text font="serif" color="muted" leading="normal">
          {`Your crew starts with *group*, a tag granted by your background, plus ${maxTags} more of your choice.`}
        </Text>
        {overLimitTagCount > 0 && (
          <Text role="status" size="xs" color="accent" italic leading="normal">
            {`${overLimitTagCount} too many selected — uncheck ${overLimitTagCount === 1 ? "one" : String(overLimitTagCount)}.`}
          </Text>
        )}
        <CheckboxGroup
          items={tagItemsWithDisable}
          checked={tagsChecked}
          onChange={handleTagChange}
          columns="responsive-2-4-6"
        />
        <div className={styles.customTagsRow}>
          {tagsCustom.map((val, i) => (
            <Input
              key={CUSTOM_TAG_SLOT_IDS[i]}
              data-index={i}
              className={styles.customTagInput}
              type="text"
              value={val}
              placeholder="Custom tag"
              aria-label={`Custom tag ${i + 1}`}
              onChange={handleTagCustomChange}
              onBlur={handleTagCustomBlur}
            />
          ))}
        </div>
        <div className={styles.exceptionalRow}>
          <Checkbox
            checked={isExceptional}
            disabled={!hasHeroesToTheLast}
            onChange={handleExceptionalChange}
            label={
              <>exceptional <Text as="span" size="xs" color="muted" italic>(requires Heroes to the Last)</Text></>

            }
          />
        </div>
      </PlaybookSection>

      <div className={styles.columns}>
        <OptionSelect
          name="marshal-crew"
          options={INSTINCT_OPTIONS}
          value={toCustomSentinel(features.crewInstinct)}
          customValue={features.crewInstinctCustom ?? ""}
          onChange={handleCrewInstinctSave}
        />
        <OptionSelect
          name="marshal-crew-cost"
          title="Cost"
          options={COST_OPTIONS}
          value={toCustomSentinel(features.crewCost)}
          customValue={features.crewCostCustom ?? ""}
          onChange={handleCrewCostSave}
          header={
            <LoyaltyRow
              value={loyalty}
              onChange={handleLoyaltyChange}
              label={
                <Text
                  as="span"
                  font="serif"
                  color="muted"
                  className={styles.loyaltyLabel}
                >
                  Loyalty
                </Text>
              }
            />
          }
        />
      </div>

      <PlaybookSection title="Inventory">
        <Text font="serif" color="muted" leading="normal">
          3 ◈ or fewer is a light load; 4-6 ◈ is a normal load; 7-9 ◈ is a heavy
          load.
        </Text>
        <Divider />
        <div className={styles.inventoryList}>
          {INVENTORY_ITEMS.map((item) => (
            <InventoryRow
              key={item.id}
              item={item}
              checked={inventoryChecked[item.id] ?? false}
              onCheckedChange={handleInventoryCheckedChange}
            />
          ))}
          {inventoryChecked["supplies"] && (
            <div className={styles.suppliesGrid}>
              {Array.from({ length: CREW_SIZE }, (_, i) => (
                <SuppliesMemberDots
                  key={`supplies-member-slot-${i}`}
                  memberIndex={i}
                  total={4 + prosperity}
                  checked={suppliesUses[i] ?? 0}
                  onChange={handleSuppliesUsesChange}
                />
              ))}
            </div>
          )}
          <CustomItemsGrid
            singleItems={CUSTOM_ITEM_INDICES.map(
              (i) => customItems[i] ?? { checked: false, text: "" },
            )}
            doubleItems={CUSTOM_ITEM_INDICES.map(
              (i) => customItems[i + 4] ?? { checked: false, text: "" },
            )}
            doubleOffset={4}
            onCheckedChange={handleCustomItemChecked}
            onTextChange={handleCustomItemText}
            onBlur={handleCustomItemBlur}
            ariaPrefix="Custom inventory item"
          />
        </div>
      </PlaybookSection>

      <PlaybookSection title="Individuals">
        <Text size="xs" font="serif" color="muted" leading="normal">
          When one stands out, give them a name, a tag, and one or more traits.
        </Text>
        <Text font="serif" color="muted" leading="normal">
          **Names:** Aled, Culhwich, Eira, Gerat, Glaw, Harri, Lowri, Mervyn,
          Nesta
        </Text>
        <Text font="serif" color="muted" leading="normal">
          **Tags:** *animal-lover, big, bully, cynical, drunkard, eager,
          gambler, greedy, grumpy, gullible, heartthrob, honest, kind, lewd,
          little, naive, old, popular, proud, rookie, reckless, shameless,
          sharp-eyed, short-tempered*
        </Text>
        <Text font="serif" color="muted" leading="normal">
          **Traits:** __'s kid/sibling/parent/cousin/__, bald, crush on __,
          grudge against __, hates __, idolizes __, jokes, messy, missing
          eye/finger/hand/__, misses their kids, nightmares, recently married,
          religious, scars, skinny, sharp-tongued, sings, snores, tells tall
          tales, too serious, troubles at home, whistles, whittler
        </Text>
        <div className={styles.individualsGrid}>
          {individuals.map((ind, i) => (
            <IndividualSlot
              key={`crew-individual-slot-${i}`}
              index={i}
              name={ind.name}
              linkedName={npcById.get(npcLinks[String(i)] ?? '')?.name}
              linkedTraits={npcById.get(npcLinks[String(i)] ?? '')
                ? (npcById.get(npcLinks[String(i)] ?? '')?.traits ?? []).join(', ') : undefined}
              tag={ind.tag}
              traits={ind.traits}
              onChange={handleIndividualChange}
              onBlur={handleIndividualBlur}
              npcControls={
                <div className={styles.npcLink}>
                  {npcLinks[String(i)] ? (
                    <>
                      <Text size="xs" color="muted">
                        {npcById.has(npcLinks[String(i)])
                          ? 'Linked to Steading NPC; name and relationships are shared.'
                          : 'Linked NPC was removed. Unlink to choose another.'}
                      </Text>
                      <div className={styles.npcLinkActions}>
                        {npcById.has(npcLinks[String(i)]) && (
                          <Button variant="secondary" size="sm" disabled={linkBusy !== null}
                            onClick={() => handleEditNpc(i)}
                            aria-label={`Edit Steading NPC for individual ${i + 1}`}>
                            Edit NPC
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" disabled={linkBusy !== null}
                          onClick={() => handleLinkNpc(i, null)}
                          aria-label={`Unlink individual ${i + 1} from Steading NPC`}>
                          Unlink
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      {npcGroups.length > 0 && (
                        <Dropdown
                          id={`crew-npc-${i}`}
                          aria-label={`Link individual ${i + 1} to existing NPC`}
                          value=""
                          groups={npcGroups}
                          onChange={(id) => handleLinkNpc(i, id)}
                          disabled={linkBusy !== null}
                          placeholder="Link existing NPC…"
                        />
                      )}
                      <Button variant="secondary" size="sm" disabled={linkBusy !== null || !ind.name.trim()}
                        onClick={() => handleCreateNpc(i)}
                        aria-label={`Create Steading NPC from individual ${i + 1}`}>
                        Create NPC
                      </Button>
                    </>
                  )}
                </div>
              }
            />
          ))}
        </div>
      </PlaybookSection>
      {npcModal && modalInitial && (
        <NpcModal
          key={`crew-npc-${npcModal.mode}-${npcModal.slot}-${modalNpc?.id ?? ''}`}
          open
          onClose={handleCloseNpc}
          onSave={handleSaveNpc}
          initial={modalInitial}
          draftKey={`crew-npc-${characterId}-${npcModal.slot}-${modalNpc?.id ?? 'new'}`}
          title={npcModal.mode === 'create' ? 'Create Steading NPC from Crew' : 'Edit linked Steading NPC'}
          relationshipGroups={modalGroups}
        />
      )}
    </div>
  );
};
