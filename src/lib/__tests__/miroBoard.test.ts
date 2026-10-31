import { describe, expect, it } from 'vitest';
import { parseMiroBoardUrl } from '../miroBoard';

describe('parseMiroBoardUrl', () => {
  it('accepts Miro board URLs without stripping invitation parameters', () => {
    expect(parseMiroBoardUrl(' https://miro.com/app/board/uXjABC123/?share_link_id=xyz ')).toBe(
      'https://miro.com/app/board/uXjABC123/?share_link_id=xyz',
    );
  });

  it('accepts Miro welcome links', () => {
    expect(parseMiroBoardUrl('https://miro.com/welcomeonboard/abc123/')).toBe(
      'https://miro.com/welcomeonboard/abc123/',
    );
  });

  it.each([
    '', undefined, 12,
    'https://miro.com/',
    'https://miro.com/app/board/',
    'http://miro.com/app/board/abc/',
    'https://miro.com.evil.example/app/board/abc/',
    'https://evil.example/app/board/abc/',
    'javascript:alert(1)',
    'https://person:password@miro.com/app/board/abc/',
    'not-a-url',
  ])('rejects invalid, non-Miro, or unsafe values: %s', (value) => {
    expect(parseMiroBoardUrl(value)).toBeNull();
  });
});
