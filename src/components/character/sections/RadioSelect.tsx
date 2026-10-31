import { useCallback } from 'react';
import type { ReactNode } from 'react';
import { OptionSelect } from './OptionSelect';
import type { CharacterData, RadioOption } from '@/types';

interface RadioSelectProps {
  playbookKey?: string;
  title?: string;
  header?: ReactNode;
  instruction?: ReactNode;
  options?: RadioOption[];
  data?: CharacterData;
  onSave?: (data: Partial<CharacterData>, base?: Partial<CharacterData>) => Promise<void>;
  overrideNote?: string;
  chooseNote?: string;
  dataKey?: keyof CharacterData;
  customKey?: keyof CharacterData;
  noCustom?: boolean;
}

/**
 * OptionSelect bound to a pair of top-level CharacterData keys. Only for
 * selections that really live on the character document (instinct, place of
 * origin); anything stored in playbookFeatures should render OptionSelect
 * directly with its own value/onChange rather than faking a CharacterData.
 */
export const RadioSelect = ({
  playbookKey,
  data,
  onSave,
  dataKey = 'instinct',
  // Deliberately has no default. It used to default to 'instinctCustom', so the
  // Place of Origin picker — which shares this component but has no custom field
  // of its own — wrote an empty string over the player's typed Instinct every
  // time they chose an origin. A caller that collects custom text names its own
  // key; the rest write dataKey alone.
  customKey,
  ...rest
}: RadioSelectProps = {}) => {
  const handleChange = useCallback(
    (value: string, customValue: string) =>
      onSave?.({
        [dataKey]: value,
        ...(customKey ? { [customKey]: customValue } : {}),
      } as Partial<CharacterData>) ?? Promise.resolve(),
    [onSave, dataKey, customKey]
  );

  return (
    <OptionSelect
      {...rest}
      name={`${playbookKey}-${String(dataKey)}`}
      value={data?.[dataKey] as string | undefined}
      customValue={customKey ? (data?.[customKey] as string | undefined) : undefined}
      onChange={handleChange}
    />
  );
};
