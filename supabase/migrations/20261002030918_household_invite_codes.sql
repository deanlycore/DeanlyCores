-- Invite codes that start a new household.
-- Owners of an existing home (DeanFamily included) can create, list, and revoke
-- codes. Redeeming a code creates a separate household and makes the redeemer
-- its owner. It never adds them to the issuer's household.
--
-- Apply on project dpjzlitklsjtfrfrxvhl as household_invite_codes.
-- Leave Supabase Auth "Allow new users to sign up" off. The app creates the
-- login with the service role only after this code checks out.

create table public.household_invite_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  created_by uuid not null references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  expires_at timestamptz,
  max_uses integer not null default 1,
  uses integer not null default 0,
  revoked_at timestamptz,
  purpose text not null default 'create_household',
  created_at timestamptz not null default now(),
  constraint household_invite_codes_code_key unique (code),
  constraint household_invite_codes_code_format check (
    code ~ '^DEAN-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'
  ),
  constraint household_invite_codes_max_uses_check check (max_uses >= 1 and max_uses <= 20),
  constraint household_invite_codes_uses_check check (uses >= 0 and uses <= max_uses),
  constraint household_invite_codes_purpose_check check (purpose = 'create_household')
);

create index household_invite_codes_household_idx
  on public.household_invite_codes (household_id, created_at desc);

comment on table public.household_invite_codes is
  'Limited-use codes that create a new household. Not membership invites.';

create or replace function public.is_household_owner(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = p_household_id
      and hm.user_id = auth.uid()
      and hm.role = 'owner'
  );
$$;

-- Direct inserts would let a signed-in person create a home or join DeanFamily
-- without a code. Security-definer functions below are the only writers.
drop policy if exists households_insert_authenticated on public.households;
drop policy if exists household_members_insert on public.household_members;

drop policy if exists households_update_member on public.households;
create policy households_update_owner on public.households
  for update to authenticated
  using (public.is_household_owner(id))
  with check (public.is_household_owner(id));

alter table public.household_invite_codes enable row level security;

revoke all on table public.household_invite_codes from public, anon, authenticated;
grant select, insert, update on table public.household_invite_codes to authenticated;

create policy household_invite_codes_select_owner
  on public.household_invite_codes
  for select to authenticated
  using (public.is_household_owner(household_id));

create policy household_invite_codes_insert_owner
  on public.household_invite_codes
  for insert to authenticated
  with check (
    public.is_household_owner(household_id)
    and created_by = auth.uid()
    and uses = 0
    and revoked_at is null
    and purpose = 'create_household'
  );

create policy household_invite_codes_update_owner
  on public.household_invite_codes
  for update to authenticated
  using (public.is_household_owner(household_id))
  with check (public.is_household_owner(household_id));

-- Owners may only revoke. The redeem function sets deanly.invite_redeem and
-- may only increment uses by one.
create or replace function public.protect_invite_code_row()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if tg_op is null then
    raise exception 'Invite codes cannot be edited that way.';
  end if;

  if tg_op is distinct from 'UPDATE' then
    return new;
  end if;

  if current_setting('deanly.invite_redeem', true) = 'on' then
    if new.uses is distinct from old.uses + 1
      or new.code is distinct from old.code
      or new.created_by is distinct from old.created_by
      or new.household_id is distinct from old.household_id
      or new.expires_at is distinct from old.expires_at
      or new.max_uses is distinct from old.max_uses
      or new.revoked_at is distinct from old.revoked_at
      or new.purpose is distinct from old.purpose
      or new.created_at is distinct from old.created_at
    then
      raise exception 'Invite codes cannot be edited that way.';
    end if;
    return new;
  end if;

  if new.code is distinct from old.code
    or new.uses is distinct from old.uses
    or new.max_uses is distinct from old.max_uses
    or new.expires_at is distinct from old.expires_at
    or new.household_id is distinct from old.household_id
    or new.created_by is distinct from old.created_by
    or new.purpose is distinct from old.purpose
    or new.created_at is distinct from old.created_at
    or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at)
    or (old.revoked_at is null and new.revoked_at is null)
  then
    raise exception 'Invite codes cannot be edited that way.';
  end if;

  return new;
end;
$$;

create trigger household_invite_codes_protect
  before update on public.household_invite_codes
  for each row execute function public.protect_invite_code_row();

create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
set search_path to 'public'
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  raw bytea := extensions.gen_random_bytes(8);
  body text := '';
  i int;
begin
  for i in 0..7 loop
    body := body || substr(alphabet, 1 + (get_byte(raw, i) % length(alphabet)), 1);
  end loop;
  return 'DEAN-' || body;
end;
$$;

create or replace function public.create_household_invite_code(
  p_max_uses integer,
  p_expires_at timestamptz
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
  generated text;
  attempts integer := 0;
begin
  if uid is null then
    raise exception 'Sign in to continue.';
  end if;

  select household_id into hid
  from public.household_members
  where user_id = uid
    and role = 'owner'
  order by created_at
  limit 1;

  if hid is null then
    raise exception 'Only a household owner can create a code.';
  end if;

  if p_max_uses is null or p_max_uses < 1 or p_max_uses > 20 then
    raise exception 'Choose between 1 and 20 uses.';
  end if;

  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Pick a future expiry, or Never.';
  end if;

  loop
    attempts := attempts + 1;
    if attempts > 5 then
      raise exception 'Something got in the way. Please try again.';
    end if;
    generated := public.generate_invite_code();
    begin
      insert into public.household_invite_codes (
        code, created_by, household_id, expires_at, max_uses, uses, purpose
      )
      values (generated, uid, hid, p_expires_at, p_max_uses, 0, 'create_household');
      return generated;
    exception
      when unique_violation then
        null;
    end;
  end loop;

  raise exception 'Something got in the way. Please try again.';
end;
$$;

create or replace function public.revoke_household_invite_code(p_code_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
  updated integer;
begin
  if uid is null then
    raise exception 'Sign in to continue.';
  end if;

  select household_id into hid
  from public.household_members
  where user_id = uid
    and role = 'owner'
  order by created_at
  limit 1;

  if hid is null then
    raise exception 'Only a household owner can revoke a code.';
  end if;

  update public.household_invite_codes
  set revoked_at = now()
  where id = p_code_id
    and household_id = hid
    and revoked_at is null;

  get diagnostics updated = row_count;
  if updated = 0 then
    raise exception 'That code isn’t valid anymore. Ask for a new one.';
  end if;
end;
$$;

-- Same answer for missing, expired, revoked, and used-up codes.
create or replace function public.peek_household_invite_code(p_code text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.household_invite_codes
    where code = upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g'))
      and char_length(code) <= 32
      and revoked_at is null
      and purpose = 'create_household'
      and (expires_at is null or expires_at > now())
      and uses < max_uses
  );
$$;

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
begin
  if uid is null then
    raise exception 'Sign in to continue.';
  end if;

  if exists (
    select 1 from public.household_members where user_id = uid
  ) then
    raise exception 'You’re already in a home. Leave it in Settings before starting another.';
  end if;

  normalized := upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g'));
  if normalized = '' or char_length(normalized) > 32 then
    raise exception 'That code isn’t valid anymore. Ask for a new one.';
  end if;

  select * into invite
  from public.household_invite_codes
  where code = normalized
  for update;

  if not found then
    raise exception 'That code isn’t valid anymore. Ask for a new one.';
  end if;

  if invite.revoked_at is not null
    or invite.purpose is distinct from 'create_household'
    or (invite.expires_at is not null and invite.expires_at <= now())
    or invite.uses >= invite.max_uses
  then
    raise exception 'That code isn’t valid anymore. Ask for a new one.';
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

  -- Same starter categories as DeanFamily. Shared vs Just me is an app default:
  -- bills, calendar, meals, shopping, and budget start Shared; notes and uploads start Just me.
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

  return new_id;
end;
$$;

create or replace function public.rename_household(household_name text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
  chosen text;
begin
  if uid is null then
    raise exception 'Sign in to continue.';
  end if;

  select household_id into hid
  from public.household_members
  where user_id = uid
    and role = 'owner'
  order by created_at
  limit 1;

  if hid is null then
    raise exception 'Only a household owner can rename the household.';
  end if;

  chosen := nullif(btrim(coalesce(household_name, '')), '');
  if chosen is null then
    raise exception 'Enter a household name.';
  end if;
  if char_length(chosen) > 80 then
    raise exception 'Please use a shorter household name.';
  end if;

  update public.households
  set name = chosen,
      updated_at = now()
  where id = hid;

  return chosen;
end;
$$;

-- Once any household exists, further homes go through a create-home code.
-- An empty database can still bootstrap its first home with this function.
create or replace function public.create_household(household_name text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  new_id uuid;
  chosen text;
begin
  if uid is null then
    raise exception 'Sign in to continue.';
  end if;

  if exists (select 1 from public.households) then
    raise exception 'A create-home code is required.';
  end if;

  if exists (
    select 1 from public.household_members where user_id = uid
  ) then
    raise exception 'You already belong to a household.';
  end if;

  chosen := nullif(btrim(coalesce(household_name, '')), '');
  if chosen is null then
    chosen := 'DeanFamily';
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

  return new_id;
end;
$$;

revoke all on function public.is_household_owner(uuid) from public, anon;
revoke all on function public.protect_invite_code_row() from public, anon;
revoke all on function public.generate_invite_code() from public, anon, authenticated;
revoke all on function public.create_household_invite_code(integer, timestamptz) from public, anon;
revoke all on function public.revoke_household_invite_code(uuid) from public, anon;
revoke all on function public.peek_household_invite_code(text) from public;
revoke all on function public.redeem_household_invite_code(text, text) from public, anon;
revoke all on function public.rename_household(text) from public, anon;
revoke all on function public.create_household(text) from public, anon;

grant execute on function public.is_household_owner(uuid) to authenticated;
grant execute on function public.protect_invite_code_row() to authenticated;
grant execute on function public.create_household_invite_code(integer, timestamptz) to authenticated;
grant execute on function public.revoke_household_invite_code(uuid) to authenticated;
grant execute on function public.peek_household_invite_code(text) to anon, authenticated;
grant execute on function public.redeem_household_invite_code(text, text) to authenticated;
grant execute on function public.rename_household(text) to authenticated;
grant execute on function public.create_household(text) to authenticated;
