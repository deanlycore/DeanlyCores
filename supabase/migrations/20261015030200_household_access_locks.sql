-- Access locks for one household.
--
-- A role change is allowed only when the caller is a different owner of that
-- same household. Owner rows are locked before the last-owner count, so two
-- owners cannot demote each other and leave none.
-- Self-serve profile edits can change name and color only.
-- An invite code carries its role. Redeem ignores any role sent by the client.
-- A code belongs to one household: a code from one home cannot join another.

create or replace function public.protect_household_member_role()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  other_owners integer;
begin
  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.household_id is distinct from old.household_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Membership cannot be reassigned.';
  end if;

  if new.role is not distinct from old.role then
    return new;
  end if;

  perform hm.user_id
  from public.household_members hm
  where hm.household_id = old.household_id
    and hm.role = 'owner'
  order by hm.user_id
  for update;

  if old.role = 'owner' and new.role is distinct from 'owner' then
    select count(*) into other_owners
    from public.household_members
    where household_id = old.household_id
      and role = 'owner'
      and user_id <> old.user_id;

    if other_owners = 0 then
      raise exception 'A household needs at least one owner.';
    end if;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  if auth.uid() is distinct from old.user_id
     and public.is_household_owner(old.household_id) then
    return new;
  end if;

  if auth.uid() = old.user_id then
    raise exception 'You cannot change your own role.';
  end if;

  raise exception 'Only an owner can change permissions.';
end;
$$;

create or replace function public.protect_household_member_delete()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  other_owners integer;
begin
  perform hm.user_id
  from public.household_members hm
  where hm.household_id = old.household_id
    and hm.role = 'owner'
  order by hm.user_id
  for update;

  if old.role = 'owner' then
    select count(*) into other_owners
    from public.household_members
    where household_id = old.household_id
      and role = 'owner'
      and user_id <> old.user_id;

    if other_owners = 0 then
      raise exception 'A household needs at least one owner.';
    end if;
  end if;

  perform public.purge_private_household_rows(old.household_id, old.user_id);
  return old;
end;
$$;

revoke update on table public.family_profiles from authenticated;
grant update (name, color) on table public.family_profiles to authenticated;

create or replace function public.save_family_profile(
  p_id uuid,
  p_name text,
  p_role text,
  p_birthday date,
  p_color text,
  p_notes text,
  p_archive boolean
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  row public.family_profiles%rowtype;
  caller public.member_role;
  clean_name text;
  clean_role text;
  clean_notes text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to continue.';
  end if;

  select * into row
  from public.family_profiles
  where id = p_id
  for update;

  if not found then
    raise exception 'You cannot edit this family member.';
  end if;

  caller := public.household_member_role(row.household_id);
  if caller is null then
    raise exception 'You cannot edit this family member.';
  end if;

  if p_archive then
    if caller is distinct from 'owner' then
      raise exception 'Only an owner can remove a family member.';
    end if;
    if row.user_id is not null then
      raise exception 'A household login stays on Family.';
    end if;
    update public.family_profiles
    set archived_at = now()
    where id = row.id
      and archived_at is null;
    return row.id;
  end if;

  clean_name := btrim(coalesce(p_name, ''));
  if char_length(clean_name) < 1 or char_length(clean_name) > 80 then
    raise exception 'Add a name.';
  end if;
  if p_color is null or p_color not in ('teal', 'deep', 'sand', 'success', 'warn', 'ink') then
    raise exception 'Pick a color.';
  end if;

  clean_role := nullif(btrim(coalesce(p_role, '')), '');
  if clean_role is not null and char_length(clean_role) > 80 then
    raise exception 'Use a shorter role.';
  end if;
  clean_notes := nullif(btrim(coalesce(p_notes, '')), '');
  if clean_notes is not null and char_length(clean_notes) > 2000 then
    raise exception 'Use a shorter note.';
  end if;

  if row.user_id is not distinct from auth.uid() then
    update public.family_profiles
    set name = clean_name,
        color = p_color
    where id = row.id;
    return row.id;
  end if;

  if caller = 'owner' or (row.user_id is null and caller in ('adult', 'member')) then
    update public.family_profiles
    set name = clean_name,
        role = clean_role,
        birthday = p_birthday,
        color = p_color,
        notes = clean_notes
    where id = row.id;
    return row.id;
  end if;

  raise exception 'You cannot edit this family member.';
end;
$$;

comment on function public.save_family_profile(uuid, text, text, date, text, text, boolean) is
  'Edits one Family card in the caller household. Self edits write name and color only.';

alter table public.household_invite_codes
  add column granted_role public.member_role not null default 'owner';

alter table public.household_invite_codes
  drop constraint household_invite_codes_purpose_check;

alter table public.household_invite_codes
  add constraint household_invite_codes_purpose_check
  check (purpose in ('create_household', 'join_household'));

alter table public.household_invite_codes
  add constraint household_invite_codes_granted_role_check
  check (
    granted_role in ('owner', 'adult', 'view_only')
    and (purpose = 'join_household' or granted_role = 'owner')
  );

comment on column public.household_invite_codes.granted_role is
  'Role applied at redeem. The client cannot choose a different one.';

create or replace function public.protect_invite_code_row()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if tg_op is distinct from 'UPDATE' then
    return new;
  end if;

  if new.granted_role is distinct from old.granted_role then
    raise exception 'Invite codes cannot be edited that way.';
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

create or replace function public.create_household_member_code(
  p_role text,
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
  granted public.member_role;
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

  if p_role is null or p_role not in ('owner', 'adult', 'view_only') then
    raise exception 'Choose a permission.';
  end if;
  granted := p_role::public.member_role;

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
        code, created_by, household_id, expires_at, max_uses, uses, purpose, granted_role
      )
      values (generated, uid, hid, p_expires_at, p_max_uses, 0, 'join_household', granted);
      return generated;
    exception
      when unique_violation then
        null;
    end;
  end loop;

  raise exception 'Something got in the way. Please try again.';
end;
$$;

drop function if exists public.redeem_household_invite_code(text, text);

create or replace function public.redeem_household_invite_code(
  p_code text,
  p_household_name text,
  p_role text default null
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
  landed uuid;
begin
  -- p_role is part of the signature so a client may send it. It is never stored.
  perform p_role;

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
    or invite.purpose not in ('create_household', 'join_household')
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

  if invite.purpose = 'join_household' then
    insert into public.household_members (household_id, user_id, role)
    values (invite.household_id, uid, invite.granted_role);
    landed := invite.household_id;

    insert into public.user_preferences (user_id, household_id)
    values (uid, landed)
    on conflict (user_id) do update
      set household_id = excluded.household_id,
          updated_at = now();
  else
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
    values (new_id, uid, invite.granted_role);

    perform public.seed_default_categories(new_id);

    insert into public.user_preferences (user_id, household_id)
    values (uid, new_id)
    on conflict (user_id) do update
      set household_id = excluded.household_id,
          updated_at = now();

    landed := new_id;
  end if;

  perform set_config('deanly.invite_redeem', 'on', true);

  update public.household_invite_codes
  set uses = uses + 1
  where id = invite.id;

  delete from public.household_invite_account_holds
  where code_id = invite.id
    and v_email <> ''
    and email = v_email;

  return landed;
end;
$$;

revoke all on function public.save_family_profile(uuid, text, text, date, text, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.create_household_member_code(text, integer, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.redeem_household_invite_code(text, text, text) from public, anon, authenticated, service_role;

grant execute on function public.save_family_profile(uuid, text, text, date, text, text, boolean) to authenticated;
grant execute on function public.create_household_member_code(text, integer, timestamptz) to authenticated;
grant execute on function public.redeem_household_invite_code(text, text, text) to authenticated;

revoke all on table public.family_profiles from anon;
revoke all on table public.household_members from anon;
