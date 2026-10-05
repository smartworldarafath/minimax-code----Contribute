import { describe, expect, it } from 'vitest';
import { getResponseFormatHint } from '@mavis/shared';

describe('getResponseFormatHint', () => {
  it('returns markdown_subset formatting for telegram without MarkdownV2 backslash escaping rules', () => {
    const hint = getResponseFormatHint('telegram');
    expect(hint).toBeDefined();
    expect(hint?.text_markup).toBe('markdown_subset');
    expect(hint?.rules).toContain(
      'Use plain text or basic markdown (bold, italic, code blocks, lists, links).',
    );
    expect(hint?.rules).toContain('Do not escape special characters with backslashes.');
    expect(hint?.rules.some((rule) => rule.includes('Escape special characters'))).toBe(false);
    expect(hint?.rules.some((rule) => rule.includes('MarkdownV2'))).toBe(false);
  });

  it('returns markdown_subset formatting for feishu', () => {
    const hint = getResponseFormatHint('feishu');
    expect(hint).toBeDefined();
    expect(hint?.text_markup).toBe('markdown_subset');
    expect(hint?.rules.length).toBeGreaterThan(0);
  });

  it('returns undefined for unsupported platforms', () => {
    // @ts-expect-error testing invalid platform input
    expect(getResponseFormatHint('unknown_platform')).toBeUndefined();
  });
});
