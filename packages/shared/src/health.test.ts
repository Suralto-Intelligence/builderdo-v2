import { describe, expect, it } from 'vitest';
import { overallStatus } from './health';

describe('overallStatus', () => {
  it('is ok only when every dependency is up', () => {
    expect(overallStatus({ database: 'up', queue: 'up' })).toBe('ok');
    expect(overallStatus({ database: 'up', queue: 'down' })).toBe('degraded');
    expect(overallStatus({})).toBe('ok');
  });
});
