-- Remove anonymous execute on the legacy household invite-code functions.
-- The functions stay. Dropping them ships later with email sign-up.
-- Not applied to production by this change.
--
-- App call sites in src/lib/actions/invite.ts, and who still may execute:
--   peek_household_invite_code(text)                 authenticated (user client)
--   redeem_household_invite_code(text, text, text)   authenticated (user client, after sign-in)
--   create_household_invite_code(integer, timestamptz) authenticated (user client, after sign-in)
--   revoke_household_invite_code(uuid)               authenticated (user client, after sign-in)
--   reserve_household_invite_account(text, text)     service_role (admin client)
--   release_household_invite_account(text, text)     service_role (admin client)
-- generate_invite_code() is only called from those security-definer creators.
-- protect_invite_code_row() is the before-update trigger. Authenticated keeps
-- execute so an owner update allowed by the table policy can still fire it.
-- create_household_member_code has no TypeScript call site. Its authenticated
-- grant stays, because it is the signed-in owner API. Anon and public lose it.
--
-- seed_default_categories is not an API. create_household(text) and
-- redeem_household_invite_code(text, text, text) are security definer, owned
-- by the same role as this function, and they are the household-creation callers.

revoke execute on function public.protect_invite_code_row() from public, anon;
revoke execute on function public.generate_invite_code() from public, anon;
revoke execute on function public.create_household_invite_code(integer, timestamptz) from public, anon;
revoke execute on function public.revoke_household_invite_code(uuid) from public, anon;
revoke execute on function public.peek_household_invite_code(text) from public, anon;
revoke execute on function public.redeem_household_invite_code(text, text, text) from public, anon;
revoke execute on function public.create_household_member_code(text, integer, timestamptz) from public, anon;
revoke execute on function public.reserve_household_invite_account(text, text) from public, anon;
revoke execute on function public.release_household_invite_account(text, text) from public, anon;

grant execute on function public.reserve_household_invite_account(text, text) to service_role;
grant execute on function public.release_household_invite_account(text, text) to service_role;

create or replace function public.seed_default_categories(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cats text[] := array[
    'Housing','Utilities','Internet','Phone','Groceries','Restaurants',
    'Transportation','Gas','Car','Insurance','Medical','Pets',
    'Entertainment','Subscriptions','Shopping','Personal','Savings','Debt','Other'
  ];
  i integer;
begin
  for i in 1..pg_catalog.array_length(cats, 1) loop
    insert into public.categories (household_id, name, kind, sort_order)
    values (p_household_id, cats[i], 'expense', i)
    on conflict (household_id, name) do nothing;
  end loop;
end;
$$;

revoke execute on function public.seed_default_categories(uuid) from public, anon, authenticated;
grant execute on function public.seed_default_categories(uuid) to service_role;

comment on function public.seed_default_categories(uuid) is
  'Starter expense categories for a new household. Not an API. Called by security-definer create_household and redeem_household_invite_code, which run as the owner.';
