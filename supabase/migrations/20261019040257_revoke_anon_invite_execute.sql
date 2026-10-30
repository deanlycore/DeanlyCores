-- Remove anonymous execute on the legacy household invite-code functions.
-- The functions stay. Dropping them ships later with email sign-up.
-- Not applied to production by this change.
--
-- App call sites in src/lib/actions/invite.ts, and who still may execute:
--   peek_household_invite_code(text)                 anon and authenticated here.
--     The next migration revokes anon. /join then peeks with service_role.
--   redeem_household_invite_code(text, text, text)   authenticated (user client, after sign-in)
--   create_household_invite_code(integer, timestamptz) authenticated (user client, after sign-in)
--   revoke_household_invite_code(uuid)               authenticated (user client, after sign-in)
--   reserve_household_invite_account(text, text)     service_role (admin client)
--   release_household_invite_account(text, text)     service_role (admin client)
-- The hold functions used to declare a local named email and then filter
-- household_invite_account_holds with email = email, which is 42702. The
-- local is v_email now. Signatures and the service_role check stay.
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
revoke execute on function public.peek_household_invite_code(text) from public;
grant execute on function public.peek_household_invite_code(text) to anon, authenticated;
revoke execute on function public.redeem_household_invite_code(text, text, text) from public, anon;
revoke execute on function public.create_household_member_code(text, integer, timestamptz) from public, anon;
revoke execute on function public.reserve_household_invite_account(text, text) from public, anon;
revoke execute on function public.release_household_invite_account(text, text) from public, anon;

-- Returns true when this call took a new hold, false when this email already holds one.
-- Only the service role may call it. The app calls it before creating the login.
create or replace function public.reserve_household_invite_account(p_code text, p_email text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  normalized text;
  v_email text;
  invite public.household_invite_codes%rowtype;
  held integer;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'not authorized';
  end if;

  normalized := upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g'));
  v_email := lower(btrim(coalesce(p_email, '')));
  if normalized = '' or char_length(normalized) > 32 or position('@' in v_email) < 2 then
    raise exception 'That code is not valid anymore. Ask for a new one.';
  end if;

  select * into invite
  from public.household_invite_codes
  where code = normalized
  for update;

  if not found
    or invite.revoked_at is not null
    or invite.purpose is distinct from 'create_household'
    or (invite.expires_at is not null and invite.expires_at <= now())
    or invite.uses >= invite.max_uses
  then
    raise exception 'That code is not valid anymore. Ask for a new one.';
  end if;

  if exists (
    select 1
    from public.household_invite_account_holds
    where code_id = invite.id
      and email = v_email
  ) then
    return false;
  end if;

  select count(*) into held
  from public.household_invite_account_holds
  where code_id = invite.id;

  if invite.uses + held >= invite.max_uses then
    raise exception 'That code is not valid anymore. Ask for a new one.';
  end if;

  insert into public.household_invite_account_holds (code_id, email)
  values (invite.id, v_email);

  return true;
end;
$$;

create or replace function public.release_household_invite_account(p_code text, p_email text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  normalized text;
  v_email text;
  invite_id uuid;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'not authorized';
  end if;

  normalized := upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g'));
  v_email := lower(btrim(coalesce(p_email, '')));
  if normalized = '' or v_email = '' then
    return;
  end if;

  select id into invite_id
  from public.household_invite_codes
  where code = normalized
  for update;

  if invite_id is null then
    return;
  end if;

  delete from public.household_invite_account_holds
  where code_id = invite_id
    and email = v_email;
end;
$$;

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
