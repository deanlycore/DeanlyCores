# Deanly — DeanFamily

Private household command center. Foundation shell: sign in, password reset, and a branded home with empty Money, Tasks, Calendar, Goals, and Reminders cards.

Tagline: Keep life together, effortlessly.

## Run locally

```bash
npm install
cp .env.example .env.local
# Fill .env.local with your Supabase project URL and keys. Do not commit it.
npm run dev
```

App: http://127.0.0.1:43123

The browser client uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` (legacy anon JWT). If that variable is empty, it falls back to `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

## Database

SQL lives in `supabase/migrations` and matches the linked Deanly project:

- `20261001204003_foundation_household_rls.sql` — already applied (profiles, households, members, preferences, categories, RLS helpers `is_household_member` and `can_access_row`)
- `20261001204307_household_helpers.sql` — already applied (`create_household`, `leave_household`, avatar bucket)
- `20261001225000_home_v1_schema.sql` — apply name **`home_v1_schema`** on project `dpjzlitklsjtfrfrxvhl`

`home_v1_schema` adds budgets, expenses, bills, goals, calendar events, tasks, notes, vault documents, meals, shopping items, subscriptions, and activity events. Every row has `household_id`, `owner_id`, and `visibility` (`shared` | `private`). RLS uses `can_access_row`, so an owner does not see another person’s Just me rows. A private `vault` storage bucket uses the same rule.

An empty migration named `home_v1_entities` was recorded earlier and should not be replayed.

In the Supabase dashboard, set **Site URL** to your app origin and add `https://<your-host>/auth/callback` to **Redirect URLs**.

## Public preview (GitHub + Vercel)

1. Push this branch to a GitHub repo under **@deanlycore**.
2. In Vercel, import that repo (framework: Next.js).
3. Set the same `NEXT_PUBLIC_*` variables from `.env.example` in the Vercel project. Do not commit real keys.
4. Set `NEXT_PUBLIC_SITE_URL` to the Vercel URL.
5. Deploy. Add that URL and `/auth/callback` in Supabase Auth redirect settings.

`npm run build` does not need a live database; pages that read the session are dynamic.
