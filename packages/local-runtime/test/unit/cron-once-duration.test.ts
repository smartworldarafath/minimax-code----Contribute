import { describe, expect, it } from 'vitest';
import { parseOnceRunAtMs as parseOnceRunAtMsTools } from '../../../agent-tools/src/shared/cron-schedule-input.js';
import { parseOnceRunAtMs as parseOnceRunAtMsRuntime } from '../../src/cron/once-time.js';

describe('cron once duration parsing', () => {
  const baseNow = 1_700_000_000_000;
  const ONE_WEEK_MS = 604_800_000;

  it('supports week unit "1w" in agent-tools cron schedule input', () => {
    const result = parseOnceRunAtMsTools({ after: '1w' }, baseNow);
    expect(result).toBe(baseNow + ONE_WEEK_MS);
  });

  it('supports compound week duration like "1w2d" in agent-tools', () => {
    const result = parseOnceRunAtMsTools({ after: '1w2d' }, baseNow);
    expect(result).toBe(baseNow + ONE_WEEK_MS + 2 * 86_400_000);
  });

  it('supports week unit "1w" in local-runtime once-time', () => {
    const result = parseOnceRunAtMsRuntime({ after: '1w' }, baseNow);
    expect(result).toBe(baseNow + ONE_WEEK_MS);
  });

  it('supports compound week duration in local-runtime once-time', () => {
    const result = parseOnceRunAtMsRuntime({ after: '2w3h' }, baseNow);
    expect(result).toBe(baseNow + 2 * ONE_WEEK_MS + 3 * 3_600_000);
  });
});
