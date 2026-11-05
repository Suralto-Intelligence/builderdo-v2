import { healthResponse, type HealthResponse } from '@builderdo/shared';

export type ApiStatus =
  | { reachable: true; health: HealthResponse }
  | { reachable: false; reason: string };

/** Fetches the API health endpoint. Never throws: the page shows the failure instead. */
export async function fetchApiStatus(
  apiUrl: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 2000,
): Promise<ApiStatus> {
  try {
    const res = await fetchImpl(new URL('/health', apiUrl), {
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const parsed = healthResponse.safeParse(await res.json());
    if (!parsed.success) return { reachable: false, reason: `unexpected response (HTTP ${res.status})` };
    return { reachable: true, health: parsed.data };
  } catch (error) {
    return { reachable: false, reason: error instanceof Error ? error.message : 'unknown error' };
  }
}
