import { useDebouncedTextField } from '@/hooks/useDebouncedTextField';
import { Heading, Input, Stack } from '@/components/ui';
import type { CharacterData } from '@/types';

interface OtherThingsFieldProps {
  value: string;
  onSave: (data: Partial<CharacterData>, base?: Partial<CharacterData>) => Promise<void>;
}

export const OtherThingsField = ({ value, onSave }: OtherThingsFieldProps) => {
  const field = useDebouncedTextField(value, (inventoryOtherThings) => onSave({ inventoryOtherThings }));

  return (
    <Stack gap={2}>
      <Heading as="h4" size="sm">Other things *(animals, kits, stashed items, etc.)*</Heading>
      <Input
        multiline
        value={field.value}
        placeholder="Notes…"
        aria-label="Other things"
        rows={3}
        onChange={field.onChange}
        onBlur={field.onBlur}
      />
    </Stack>
  );
};
