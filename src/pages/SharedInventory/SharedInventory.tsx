import { useCallback, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageLayout } from '@/components/app/PageLayout/PageLayout';
import { PageMeta } from '@/components/app/PageMeta/PageMeta';
import { GameGuard } from '@/components/app/GameGuard/GameGuard';
import { buildGameNav } from '@/components/app/PageHeader/gameNav';
import { Button, Checkbox, Dropdown, Heading, Text, UseDots } from '@/components/ui';
import { useToast } from '@/components/app/Toast/ToastContext';
import { Inventory } from '@/components/character/sections/Inventory/Inventory';
import { MAIN_ITEMS, SMALL_ITEMS, computeTotalLoad } from '@/components/character/sections/Inventory/inventoryData';
import { useArcanaWeights } from '@/components/character/sections/Inventory/useArcanaWeights';
import { SpecialPossessions } from '@/components/character/sections/SpecialPossessions';
import { SPECIAL_POSSESSIONS_OPTIONS } from '@/lib/characterCreation/specialPossessionsOptions';
import { FOX_LIFE_OF_CRIME_BACKGROUND } from '@/lib/characterCreation/backgroundOptions';
import { CustomItemsGrid } from '@/components/character/playbooks/shared/CrewWidgets';
import { CREW_INVENTORY_ITEMS, CREW_SIZE } from '@/components/character/playbooks/marshal/crewInventoryData';
import { resolvePlaybookFeatures } from '@/lib/resolvePlaybookFeatures';
import { getPlaybook } from '@/lib/constants';
import { requireSessionGameId } from '@/lib/sessionGame';
import { useGame, type UseGameResult } from '@/hooks/useGame';
import { useAutoFollowers } from '@/hooks/useAutoFollowers';
import type { Character, CharacterData, FollowerData, GameSession, PlaybookFeatures } from '@/types';
import styles from './SharedInventory.module.css';

type SaveCharacter = UseGameResult['updateCharacterData'];
type SaveData = (patch: Partial<CharacterData>, before?: Partial<CharacterData>) => Promise<void>;
const flush = () => window.dispatchEvent(new Event('hearthfire:flush'));

const CharacterGearSummary = ({ character }: { character: Character }) => {
  const data = character.data;
  const weights = useArcanaWeights(data?.arcanaMinor ?? [], data?.arcanaMajor ?? []);
  const labels = [
    ...MAIN_ITEMS.filter((item) => data?.inventoryChecked?.[item.id]).map((item) => item.label),
    ...SMALL_ITEMS.filter((item) => data?.inventorySmallChecked?.[item.id]).map((item) => item.label),
    ...(data?.inventoryPossessions ?? []).filter((item) => item.checked && item.text).map((item) => item.text),
    ...(data?.inventorySmallCustom ?? []).filter((item) => item.checked && item.text).map((item) => item.text),
    ...(data?.arcanaMinor ?? []).filter((item) => item.carried).map((item) => `${weights?.minor[item.id]?.name ?? item.id} (arcanum)`),
    ...(data?.arcanaMajor ?? []).filter((item) => item.carried).map((item) => `${weights?.major[item.id]?.name ?? item.id} (arcanum)`),
    ...(SPECIAL_POSSESSIONS_OPTIONS[character.playbook]?.items ?? [])
      .filter((item) => data?.specialPossessions?.[item.id] || item.isAlwaysSelected || item.alwaysSelectedForBackground === data?.background && !!item.alwaysSelectedForBackground)
      .map((item) => item.isCustom ? data?.specialPossessionCustom || item.name : item.name),
  ];
  return <>
    <Text size="sm" color="muted">{weights ? `Carried load: ${computeTotalLoad(data, weights.minor, weights.major)}` : 'Calculating carried load…'}</Text>
    {labels.length > 0 ? <ul className={styles.summary}>{labels.map((label, i) => <li key={`${label}-${i}`}><Text as="span" size="sm">{label}</Text></li>)}</ul>
      : <Text size="sm" color="muted">No gear marked as carried.</Text>}
    {!!data?.inventoryUndefined && <Text size="sm">Undefined provisions: {data.inventoryUndefined}</Text>}
    {!!data?.inventorySmallUndefined && <Text size="sm">Undefined small items: {data.inventorySmallUndefined}</Text>}
    {data?.inventoryOtherThings && <Text size="sm">{data.inventoryOtherThings}</Text>}
  </>;
};

const FollowerGear = ({ follower, name, followers, onSave }: { follower: FollowerData; name: string; followers: FollowerData[]; onSave: SaveData }) => {
  const { addToast } = useToast();
  const headingId = useId();
  const gear = Array.from({ length: 6 }, (_, i) => follower.gear?.[i] ?? { checked: false, text: '', weight: (i < 3 ? 1 : 2) as 1 | 2 });
  const change = (index: number, patch: { checked?: boolean; text?: string }) => {
    const nextGear = gear.map((item, i) => i === index ? { ...item, ...patch } : item);
    void onSave({ playbookFeatures: { followers: followers.map((item) => item.id === follower.id ? { ...item, gear: nextGear } : item) } },
      { playbookFeatures: { followers } }).catch(() => addToast('Could not save follower gear. Check save status.', 'error'));
  };
  return <section className={styles.gear} aria-labelledby={headingId}>
    <Heading as="h3" id={headingId} size="sm">{name}’s gear</Heading>
    <CustomItemsGrid singleItems={gear.slice(0, 3)} doubleItems={gear.slice(3)} doubleOffset={3}
      onCheckedChange={(i, checked) => change(i, { checked })} onTextChange={(i, text) => change(i, { text })}
      onBlur={flush} ariaPrefix={`${name}’s gear`} />
  </section>;
};

const CrewGear = ({ character, prosperity, onSave }: { character: Character; prosperity: number; onSave: SaveData }) => {
  const { addToast } = useToast();
  const headingId = useId();
  const features = resolvePlaybookFeatures(character.data);
  const checked = features.crewInventoryChecked ?? {};
  const custom = Array.from({ length: 8 }, (_, i) => features.crewCustomItems?.[i] ?? { checked: false, text: '' });
  const supplies = Array.from({ length: CREW_SIZE }, (_, i) => features.crewSuppliesUses?.[i] ?? 0);
  const save = (patch: Partial<PlaybookFeatures>) => {
    void onSave({ playbookFeatures: patch }, { playbookFeatures: features })
      .catch(() => addToast('Could not save crew gear. Check save status.', 'error'));
  };
  const changeCustom = (index: number, patch: { checked?: boolean; text?: string }) =>
    save({ crewCustomItems: custom.map((item, i) => i === index ? { ...item, ...patch } : item) });
  return <section className={styles.gear} aria-labelledby={headingId}>
    <Heading as="h3" id={headingId} size="sm">{character.name || 'Marshal'}’s crew gear</Heading>
    {CREW_INVENTORY_ITEMS.map((item) => <Checkbox key={item.id} variant="provision" weight={item.weight ?? 1}
      checked={checked[item.id] ?? false} label={<Text as="span">{item.label}</Text>}
      onChange={(event) => save({ crewInventoryChecked: { ...checked, [item.id]: event.target.checked } })} />)}
    {checked.supplies && supplies.map((uses, index) => <UseDots key={`crew-member-${index}`} total={4 + prosperity} checked={uses}
      ariaLabel={`Crew member ${index + 1}’s supplies`}
      onChange={(value) => save({ crewSuppliesUses: supplies.map((current, i) => i === index ? value : current) })} />)}
    <CustomItemsGrid singleItems={custom.slice(0, 4)} doubleItems={custom.slice(4)} doubleOffset={4}
      onCheckedChange={(i, value) => changeCustom(i, { checked: value })}
      onTextChange={(i, text) => changeCustom(i, { text })} onBlur={flush} ariaPrefix="Crew custom gear" />
  </section>;
};

const CharacterInventory = ({ character, game, onSaveCharacter }: { character: Character; game: GameSession; onSaveCharacter: SaveCharacter }) => {
  const headingId = useId();
  const editorId = useId();
  const [editing, setEditing] = useState(false);
  const onSave = useCallback<SaveData>((patch, before) => onSaveCharacter(character.id, patch, before), [onSaveCharacter, character.id]);
  useAutoFollowers(character.data?.specialPossessions, character.data?.inserts, onSave);
  const followers = resolvePlaybookFeatures(character.data).followers ?? [];
  const npcNames = new Map([...(game.steading?.residents ?? []), ...(game.steading?.neighbors ?? [])].map((npc) => [npc.id, npc.name]));
  const owner = character.name || getPlaybook(character.playbook)?.label || 'Character';
  const prosperity = game.steading?.prosperity ?? 0;
  const parsedLevel = parseInt(character.data?.statLevel ?? '', 10);
  const level = Number.isNaN(parsedLevel) ? character.level : parsedLevel;
  return <section className={styles.card} aria-labelledby={headingId}>
    <Heading as="h2" id={headingId} size="md">{owner}</Heading>
    <CharacterGearSummary character={character} />
    <Button variant="secondary" aria-expanded={editing} aria-controls={editorId} onClick={() => setEditing((open) => !open)}>Edit {owner}’s inventory</Button>
    <div id={editorId} hidden={!editing}>{editing && <>
      <Inventory data={character.data} prosperity={prosperity} onSave={onSave} showProsperity={false} />
      <SpecialPossessions config={SPECIAL_POSSESSIONS_OPTIONS[character.playbook]} data={character.data} onSave={onSave} level={level}
        chooseOverride={character.playbook === 'fox' && character.data?.background === FOX_LIFE_OF_CRIME_BACKGROUND ? { count: 3, note: '+1 from A Life of Crime' } : undefined} />
    </>}</div>
    <Button as={Link} variant="ghost" size="sm" to={`/game/${character.playbook}#inventory`}>Open {owner}’s sheet</Button>
    {(followers.length > 0 || character.playbook === 'marshal') && <div className={styles.companions}>
      {followers.map((follower, i) => <FollowerGear key={follower.id} follower={follower} followers={followers} onSave={onSave}
        name={npcNames.get(follower.npcId ?? '') || follower.name || `Follower ${i + 1}`} />)}
      {character.playbook === 'marshal' && <CrewGear character={character} prosperity={prosperity} onSave={onSave} />}
    </div>}
  </section>;
};

export const PartyInventory = ({ game, onSaveCharacter }: { game: GameSession; onSaveCharacter: SaveCharacter }) => {
  const [owner, setOwner] = useState('all');
  const characters = owner === 'all' ? game.characters : game.characters.filter((character) => character.id === owner);
  return <div className={styles.root}>
    <Text color="muted">Edits here also update character sheets.</Text>
    <div className={styles.filter}><Dropdown id="inventory-owner" label="Inventory owner" value={owner} onChange={setOwner}
      options={[{ value: 'all', label: 'Everyone' }, ...game.characters.map((character) => ({ value: character.id, label: character.name || getPlaybook(character.playbook)?.label || 'Character' }))]} /></div>
    {characters.length === 0 && <Text color="muted">Add a character on Party Overview to see their inventory.</Text>}
    {characters.map((character) => <CharacterInventory key={character.id} character={character} game={game} onSaveCharacter={onSaveCharacter} />)}
  </div>;
};

export const SharedInventory = () => {
  const id = requireSessionGameId();
  const { game, loading, error, updateCharacterData, logRoll } = useGame(id);
  return <GameGuard loading={loading} error={error} game={game} errorBackTo="/game" errorBackLabel="Back to Game">
    {(g) => <PageLayout title="Shared Inventory" gameId={id} nav={buildGameNav(g, '/game/inventory')}
      diceRoller={{ rollerId: 'game', rollerName: 'Party', onRoll: logRoll, rolls: g.diceRolls }}>
      <PageMeta title={`Shared Inventory — ${g.name || 'Hearthfire'}`} description="Plan party gear across character, follower and crew inventories." />
      <PartyInventory game={g} onSaveCharacter={updateCharacterData} />
    </PageLayout>}
  </GameGuard>;
};
