# Public Run Records: Owner Setup

This is an optional integration. The game remains playable offline, and both data-sharing choices are off by default. The game only loads the pinned Supabase JavaScript client after a player enables an opt-in and a valid project URL and publishable key are present. The client uses `persistSession: false`, so Auth tokens remain in memory only.

## Configure a Supabase project

1. In the Supabase dashboard, select the intended project and enable anonymous sign-ins under Authentication providers.
2. Review the project's Auth and API logging settings and retention plan. Supabase provider logs may process client IP addresses and user-agent metadata; this is separate from the game-owned database tables. See [Auth audit logs](https://supabase.com/docs/guides/auth/audit-logs) and [Supabase logs](https://supabase.com/docs/guides/telemetry/logs).
3. The migration `supabase/migrations/202609230001_public_run_records.sql` was applied to the selected project with the Supabase CLI on 2026-09-23. For future migrations, from the repository root, link the intended project and review the plan before applying it:

   ```sh
   supabase link --project-ref <project-ref>
   supabase db push --dry-run
   supabase db push
   ```

   `db push` changes the remote database. The CLI may request the database password; enter it through the secure local prompt/credential store, never in source code, the game, shell history, or this repository. The migration creates owner-scoped RLS, private run records, allowlisted rescue entries, and narrow aggregate/leaderboard RPCs.
4. Copy `public/supabase-config.example.js` to `public/supabase-config.js`. Set the project URL and its **publishable** key in that file:

   ```js
   export default Object.freeze({
     url: 'https://your-project.supabase.co',
     publishableKey: 'sb_publishable_...',
   });
   ```

   A legacy anonymous key is also accepted. `public/supabase-config.js` is ignored by Git. It must be present in the deployed static files to enable the feature. Publishable/anonymous keys are public browser keys; **never put a service-role key or secret key in this file, the game, or the repository**.
5. Serve or deploy the static `public/` files over HTTPS. Anonymous Auth and the data API will be contacted only after a player opts in and valid local configuration is loaded. The SDK is fetched from the pinned ESM CDN at that point; if the CDN, project, or network is unavailable, records remain unavailable and gameplay continues.

## Player data and limits

- Statistics consent and public-rescue consent are independent, unchecked by default. Statistics count recorded runs and opted-in anonymous Auth sessions, not people. Runs use `in_progress`, `rescued`, and `jumped` outcomes. A forced ascension stays part of an in-progress run; it is not a terminal loss.
- Public records contain only an opted-in alias, difficulty, rescue duration, memento count, and server timestamp. Public aggregate output contains only counts. Private run rows remain owner-scoped by RLS. The migration contains no `ip_address`, `user_agent`, email, device, location, or mental-health fields.
- Public scores are community-reported and unverified. The game client controls gameplay and can alter a reported outcome or duration; the database validates shape and range and prevents duplicate client run IDs, but does not provide anti-cheat verification.
- Players can delete their game-owned private run rows and public entries with `delete_my_run_data` while the current anonymous Auth session is still in memory. Auth tokens are not persisted. After closing or reloading the page, the player cannot recover that identity or use it to retrieve/delete old private rows. The migration has no automatic retention/expiry job; do not promise return access or automatic deletion.
- The delete action removes game-owned run and preference rows. It does not erase Supabase Auth security audit logs or provider-side operational logs. Review and configure provider log retention in the project.

## Local verification

Run the static Node checks without installing packages:

```bash
node --test tests/*.test.mjs
```

Open the game with `?test` for its existing Three.js gameplay harness. The browser run-record flow still requires a configured project and explicit player opt-in; do not use a live project for test runs unless its owner authorizes that destination and operation.
