import { describe, expect, it } from 'vitest';
import { fetchApiStatus } from './api-status';

const okBody = { status: 'ok', service: 'api', version: 'dev', uptimeSeconds: 3, checks: { database: 'up' } };

describe('fetchApiStatus', () => {
  it('parses a healthy response', async () => {
    const fake = (async () => new Response(JSON.stringify(okBody), { status: 200 })) as typeof fetch;
    expect(await fetchApiStatus('http://api', fake)).toEqual({ reachable: true, health: okBody });
  });

  it('reports an unreachable API instead of throwing', async () => {
    const fake = (async () => { throw new Error('ECONNREFUSED'); }) as typeof fetch;
    expect(await fetchApiStatus('http://api', fake)).toEqual({ reachable: false, reason: 'ECONNREFUSED' });
  });

  it('rejects a malformed body', async () => {
    const fake = (async () => new Response('{"nope":true}', { status: 500 })) as typeof fetch;
    const result = await fetchApiStatus('http://api', fake);
    expect(result.reachable).toBe(false);
  });
});
