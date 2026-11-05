import { fetchApiStatus } from '@/lib/api-status';
import { serverEnv } from '@/lib/env';

// Always render fresh, so the status reflects the API right now.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const status = await fetchApiStatus(serverEnv().API_URL);

  return (
    <main>
      <h1>BuilderDo</h1>
      <p>Hello. Verified local contractors for your home project, coming soon.</p>
      <section className="panel" aria-label="System status">
        <strong>System status</strong>
        {status.reachable ? (
          <ul>
            <li>
              API: <span className={status.health.status === 'ok' ? 'ok' : 'bad'}>{status.health.status}</span>
            </li>
            {Object.entries(status.health.checks).map(([name, value]) => (
              <li key={name}>
                {name}: <span className={value === 'up' ? 'ok' : 'bad'}>{value}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>
            API: <span className="bad">unreachable</span> <span className="muted">({status.reason})</span>
          </p>
        )}
      </section>
    </main>
  );
}
