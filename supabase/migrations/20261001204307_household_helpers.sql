-- Helpers for the Foundation app on the linked Deanly project.
-- create_household returns an id the caller could not read back under RLS
-- until they were a member. leave_household lets a sole owner close the home.

create index if not exists household_members_user_id_idx
  on public.household_members (user_id);

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

create or replace function public.leave_household()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
  member_role public.member_role;
  others integer;
begin
  if uid is null then
    raise exception 'Sign in to continue.';
  end if;

  select household_id, role
  into hid, member_role
  from public.household_members
  where user_id = uid
  order by created_at
  limit 1;

  if hid is null then
    raise exception 'You are not in a household.';
  end if;

  if member_role = 'owner' then
    select count(*) into others
    from public.household_members
    where household_id = hid
      and user_id <> uid;

    if others > 0 then
      raise exception 'Another adult is still here. They can leave first, or you can stay as owner.';
    end if;

    delete from public.households where id = hid;
    return;
  end if;

  delete from public.household_members
  where household_id = hid
    and user_id = uid;

  update public.user_preferences
  set household_id = null,
      updated_at = now()
  where user_id = uid
    and household_id = hid;
end;
$$;

revoke all on function public.create_household(text) from public, anon;
revoke all on function public.leave_household() from public, anon;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.leave_household() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatars_select on storage.objects;
drop policy if exists avatars_insert on storage.objects;
drop policy if exists avatars_update on storage.objects;
drop policy if exists avatars_delete on storage.objects;

create policy avatars_select on storage.objects
  for select to public
  using (bucket_id = 'avatars');

create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
