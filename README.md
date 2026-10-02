# Deanly Tracking — DeanFamily

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

## Invite codes (create a new household)

Apply migration **`household_invite_codes`** (`supabase/migrations/20261002030918_household_invite_codes.sql`) on project `dpjzlitklsjtfrfrxvhl`. It is not applied there yet.

In the Supabase SQL editor, open that file and run it once. Or, with the Supabase CLI linked to that project:

```bash
supabase db push
```

What it adds:

- `household_invite_codes` — code, issuer, issuer `household_id`, nullable `expires_at`, `max_uses` (default 1), `uses`, `revoked_at`, `purpose` (`create_household` only)
- RLS so only an **owner** of the issuer household can list, create, or revoke codes
- `redeem_household_invite_code` — locks the code, creates a **new** household, adds the redeemer as owner, seeds the same categories as DeanFamily, then increments `uses`
- Direct inserts into `households` and `household_members` are closed, so a code cannot be used to join DeanFamily

Auth stays invite-only:

- Leave **Allow new users to sign up** off. DeanFamily logins created in the Supabase dashboard still sign in as they do today.
- `SUPABASE_SERVICE_ROLE_KEY` must be set on the server (already required for Web Push). **Have a code?** creates the auth user with that key only after the code checks out, confirms the email, then signs them in.
- Do not add a public Create account form. There is no signup without a valid create-home code.

New households use the same Shared defaults as DeanFamily: bills, calendar, meals, shopping, and budget start Shared; notes and uploads start Just me. The redeemer names the household (default “My household”). Owners can rename it in Settings.

In the Supabase dashboard, set **Site URL** to your app origin and add `https://<your-host>/auth/callback` to **Redirect URLs**.

## Web Push

Shared creates (bills, tasks, calendar events, meals, shopping) can notify the other household member. Just me items and notes do not. This is Web Push on the installed PWA. It is not native APNs.

Apply migration **`push_subscriptions`** (`supabase/migrations/20261002021603_push_subscriptions.sql`) on project `dpjzlitklsjtfrfrxvhl`. It is already applied there. A member can manage only their own subscription row.

Generate a VAPID key pair once:

```bash
npx web-push generate-vapid-keys
```

Mist sets these in **Vercel** (Production and Preview). Do not commit the real values.

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Vercel | Browser uses this to subscribe |
| `VAPID_PRIVATE_KEY` | Vercel, server only | Signs each push |
| `VAPID_SUBJECT` | Vercel, server only | `mailto:` or `https:` contact you control |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel, server only | Reads the other member’s endpoint. RLS hides that row from the browser |

Redeploy after saving the variables. Placeholders in `.env.example` are not live keys.

### Try it with two accounts

1. Apply the migration and set the four variables, then redeploy.
2. On each phone, open https://deanlycores.vercel.app in Safari, tap Share, then **Add to Home Screen**. iOS only delivers Web Push from that icon, on iOS 16.4 or later. A Safari tab cannot subscribe, and there is no install prompt.
3. Open Deanly Tracking from the Home Screen icon, sign in, and in Settings turn on **Notify me when something Shared is added**. Allow notifications when asked.
4. From the other account, add a shared bill, task, calendar event, meal, or shopping item. The first account should get a calm note. A Just me note, or the same item saved as Just me, should not.
5. Tap the notification. It opens the matching section and scrolls to that item.
6. On a desktop browser, localhost is enough for Chrome. Skip Add to Home Screen there. iPhone still needs the deployed HTTPS site and the Home Screen icon.

## Public preview (GitHub + Vercel)

1. Push this branch to a GitHub repo under **@deanlycore**.
2. In Vercel, import that repo (framework: Next.js).
3. Set the same `NEXT_PUBLIC_*` variables from `.env.example` in the Vercel project, plus the server-only Web Push variables in the section above. Do not commit real keys.
4. Set `NEXT_PUBLIC_SITE_URL` to the Vercel URL.
5. Deploy. Add that URL and `/auth/callback` in Supabase Auth redirect settings.

`npm run build` does not need a live database; pages that read the session are dynamic.
