import type { Night } from '../digest/types.js';

const dash = '—';

export function DigestMissing({ night }: { night: string }) {
  return (
    <>
      <h1>{night}</h1>
      <p class="mute">no run log for {night}</p>
    </>
  );
}

export function DigestPage({ night }: { night: Night }) {
  const { rows, badLines } = night;
  return (
    <>
      <h1>{night.night}</h1>
      {rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr>
                <td>{r.job}</td>
                <td>{r.owner ?? dash}</td>
                <td>{r.runs}</td>
                <td class={r.retries >= 3 ? 'warn' : undefined}>{r.retries}</td>
                <td class={r.lastStatus === 'fail' ? 'warn' : undefined}>{r.lastStatus}</td>
                <td>{r.lastError ?? dash}</td>
                <td>{r.firstAt}</td>
                <td>{r.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {badLines > 0 ? (
        <p class="mute">
          {badLines} {badLines === 1 ? "line didn't" : "lines didn't"} parse
        </p>
      ) : null}
    </>
  );
}
