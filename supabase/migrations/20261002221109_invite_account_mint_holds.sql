-- A create-home code must not mint unlimited confirmed logins.
-- Peek stays a read for the join page, including before sign-in.
-- Creating a login takes one hold per remaining use. Redeem still creates
-- that person's own household and spends one use. This is not a membership invite.
-- Not applied on project dpjzlitklsjtfrfrxvhl. Review before applying.
--
-- redeem_household_invite_code below replaces the live function. Its messages
-- stay the straight-apostrophe strings currently in production.

create table public.household_invite_account_holds (
  code_id uuid not null references public.household_invite_codes (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  primary key (code_id, email),
  constraint household_invite_account_holds_email_check check (
    email = lower(email)
    and position('@' in email) > 1
    and char_length(email) <= 320
  )
);

comment on table public.household_invite_account_holds is
  'One pending login per remaining create-home use. Not a membership invite.';

alter table public.household_invite_account_holds enable row level security;

revoke all on table public.household_invite_account_holds from public, anon, authenticated, service_role;

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
  email text;
  invite public.household_invite_codes%rowtype;
  held integer;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'not authorized';
  end if;

  normalized := upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g'));
  email := lower(btrim(coalesce(p_email, '')));
  if normalized = '' or char_length(normalized) > 32 or position('@' in email) < 2 then
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
      and email = email
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
  values (invite.id, email);

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
  email text;
  invite_id uuid;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'not authorized';
  end if;

  normalized := upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g'));
  email := lower(btrim(coalesce(p_email, '')));
  if normalized = '' or email = '' then
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
    and email = email;
end;
$$;

-- Same redeem path as production, plus: a hold reserved for someone else
-- counts against remaining uses. The caller who holds this code still redeems,
-- then that hold is removed as the use is spent.
create or replace function public.redeem_household_invite_code(
  p_code text,
  p_household_name text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  normalized text;
  invite public.household_invite_codes%rowtype;
  new_id uuid;
  chosen text;
  v_email text;
  held integer;
  mine boolean;
begin
  if uid is null then
    raise exception 'Sign in to continue.';
  end if;

  if exists (
    select 1 from public.household_members where user_id = uid
  ) then
    raise exception 'You are already in a home. Leave it in Settings before starting another.';
  end if;

  normalized := upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g'));
  if normalized = '' or char_length(normalized) > 32 then
    raise exception 'That code is not valid anymore. Ask for a new one.';
  end if;

  select * into invite
  from public.household_invite_codes
  where code = normalized
  for update;

  if not found then
    raise exception 'That code is not valid anymore. Ask for a new one.';
  end if;

  if invite.revoked_at is not null
    or invite.purpose is distinct from 'create_household'
    or (invite.expires_at is not null and invite.expires_at <= now())
    or invite.uses >= invite.max_uses
  then
    raise exception 'That code is not valid anymore. Ask for a new one.';
  end if;

  select lower(btrim(au.email)) into v_email
  from auth.users au
  where au.id = uid;

  if v_email is null or v_email = '' then
    v_email := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  end if;

  select count(*) into held
  from public.household_invite_account_holds
  where code_id = invite.id;

  mine := exists (
    select 1
    from public.household_invite_account_holds
    where code_id = invite.id
      and v_email <> ''
      and email = v_email
  );

  if not mine and invite.uses + held >= invite.max_uses then
    raise exception 'That code is not valid anymore. Ask for a new one.';
  end if;

  chosen := nullif(btrim(coalesce(p_household_name, '')), '');
  if chosen is null then
    chosen := 'My household';
  end if;
  if char_length(chosen) > 80 then
    raise exception 'Please use a shorter household name.';
  end if;

  insert into public.households (name)
  values (chosen)
  returning id into new_id;

  insert into public.household_members (household_id, user_id, role)
  values (new_id, uid, 'owner');

  perform public.seed_default_categories(new_id);

  insert into public.user_preferences (user_id, household_id)
  values (uid, new_id)
  on conflict (user_id) do update
    set household_id = excluded.household_id,
        updated_at = now();

  perform set_config('deanly.invite_redeem', 'on', true);

  update public.household_invite_codes
  set uses = uses + 1
  where id = invite.id;

  delete from public.household_invite_account_holds
  where code_id = invite.id
    and v_email <> ''
    and email = v_email;

  return new_id;
end;
$$;

revoke all on function public.reserve_household_invite_account(text, text) from public, anon, authenticated;
revoke all on function public.release_household_invite_account(text, text) from public, anon, authenticated;
grant execute on function public.reserve_household_invite_account(text, text) to service_role;
grant execute on function public.release_household_invite_account(text, text) to service_role;
