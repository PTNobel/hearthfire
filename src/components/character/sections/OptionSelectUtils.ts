export const CUSTOM_VALUE = '__custom__';

// Older Firestore records stored the literal 'custom' for the Custom… option.
export const toCustomSentinel = (v: string | undefined) => (v === 'custom' ? CUSTOM_VALUE : (v ?? ''));
