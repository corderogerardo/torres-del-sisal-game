# Automatic Run Telemetry: Owner Setup

The game automatically records run summaries by default and shows a notice before play. There is no username, player ID, anonymous Auth account, or individual public history. Players can opt out of future telemetry; opting out also clears unsent browser-queue items, but does not delete previously submitted runs. Anonymous Auth is not used or required; if its provider remains enabled from earlier setup, this migration does not change that hosted Auth setting. The game remains playable offline and loads the pinned Supabase JavaScript client only when telemetry is enabled and a valid project URL and publishable key are present.

## Configure a Supabase project

1. Review the project's API logging settings and retention plan. Supabase provider logs may process client IP addresses and user-agent metadata; this is separate from the game-owned database tables. See [Auth audit logs](https://supabase.com/docs/guides/auth/audit-logs) and [Supabase logs](https://supabase.com/docs/guides/telemetry/logs).
2. The initial migration `supabase/migrations/202609230001_public_run_records.sql` was applied to the selected project with the Supabase CLI on 2026-09-23. The follow-ups `202610150001_run_record_upsert.sql` and `202610200001_identity_free_run_telemetry.sql` are local only and have not been applied remotely. The latter creates identity-free run telemetry and revokes browser access to legacy player-deletion and public-alias paths without deleting historical rows. Applying migrations changes the remote database and requires explicit authorization. When authorized, review the plan from the repository root before applying it:

   ```sh
   supabase link --project-ref <project-ref>
   supabase db push --dry-run
   supabase db push
   ```

   `db push` changes the remote database. The CLI may request the database password; enter it through the secure local prompt/credential store, never in source code, the game, shell history, or this repository.
3. Copy `public/supabase-config.example.js` to `public/supabase-config.js`. Set the project URL and its **publishable** key in that file:

   ```js
   export default Object.freeze({
     url: 'https://your-project.supabase.co',
     publishableKey: 'sb_publishable_...',
   });
   ```

   A legacy anonymous key is also accepted. `public/supabase-config.js` is ignored by Git. It must be present in the deployed static files to enable the feature. Publishable/anonymous keys are public browser keys; **never put a service-role key or secret key in this file, the game, or the repository**.
4. Serve or deploy the static `public/` files over HTTPS. The data API is contacted when an enabled game starts or aggregate metrics load, and valid local configuration is present. No Auth session is created. If the CDN, project, or network is unavailable, gameplay continues and unsynchronized run summaries remain in the browser outbox when IndexedDB is available.

## Player data and limits

- Run telemetry is enabled by default with a persistent opt-out and a visible notice. Counts describe recorded runs, not unique people. Each summary contains a random per-run UUID used only for retry idempotency, difficulty, outcome, duration, floor, and memento count; it has no username or player ID. Runs use `in_progress`, `rescued`, and `jumped` outcomes. A forced ascension stays part of an in-progress run; it is not a terminal loss.
- The browser writes queued run summaries to IndexedDB before sending them. It retries when the game is entered, the browser comes back online, or the tab becomes visible, and removes a queued item only after Supabase confirms it. The outbox strips legacy usernames and consent metadata when loading older queued entries. Opting out clears unsent items but does not delete previously submitted runs. Clearing browser storage or never returning online can still lose unsynchronized records.
- A fully paused Supabase project cannot be awakened by an API request; the owner must restore it. Free projects may pause after inactivity. Queued records wait locally and sync after the project is available again; this is eventual delivery, not a cloud-availability guarantee.
- Browser roles can submit run summaries and read only aggregate counts plus average, median (P50), and P95 durations. They cannot read individual run rows, update or delete them, publish usernames, or access legacy player-linked rows. The new migration contains no player ID, username, IP, user-agent, email, device, location, or mental-health fields.
- Run results are community-reported and unverified. The game client controls gameplay and can alter a reported outcome or duration; the database validates shape, bounds, run lifecycle, and duplicate client run IDs, but does not provide anti-cheat verification. The anonymous public RPC can also be abused to submit fabricated runs; the run UUID prevents retry duplicates, not deliberate metric manipulation.
- Runs are not linked to a player, so there is no individual player deletion action. The migration does not delete historical rows and has no automatic retention/expiry job. Supabase provider logs remain separate from game-owned telemetry; review and configure provider log retention in the project.

## Local verification

Run the static Node checks without installing packages:

```bash
node --test tests/*.test.mjs
```

Open the game with `?test` for its existing Three.js gameplay harness. The browser telemetry flow requires a configured project and default-on telemetry; do not use a live project for test runs unless its owner explicitly authorizes that destination and operation.
