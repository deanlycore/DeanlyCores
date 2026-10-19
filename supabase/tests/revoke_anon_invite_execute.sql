-- Assert anon (and public) cannot execute the legacy invite-code functions
-- or seed_default_categories. Run with psql after the migrations:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/revoke_anon_invite_execute.sql

do $$
declare
  fn text;
  invite_fns text[] := array[
    'public.protect_invite_code_row()',
    'public.generate_invite_code()',
    'public.create_household_invite_code(integer, timestamptz)',
    'public.revoke_household_invite_code(uuid)',
    'public.peek_household_invite_code(text)',
    'public.redeem_household_invite_code(text, text, text)',
    'public.create_household_member_code(text, integer, timestamptz)',
    'public.reserve_household_invite_account(text, text)',
    'public.release_household_invite_account(text, text)'
  ];
  app_authenticated text[] := array[
    'public.peek_household_invite_code(text)',
    'public.redeem_household_invite_code(text, text, text)',
    'public.create_household_invite_code(integer, timestamptz)',
    'public.revoke_household_invite_code(uuid)',
    'public.create_household_member_code(text, integer, timestamptz)',
    'public.protect_invite_code_row()'
  ];
  seed text := 'public.seed_default_categories(uuid)';
  seed_config text;
  seed_definer boolean;
  caller record;
begin
  foreach fn in array invite_fns loop
    if has_function_privilege('anon', fn, 'execute') then
      raise exception 'anon still has execute on %', fn;
    end if;
    if has_function_privilege('public', fn, 'execute') then
      raise exception 'public still has execute on %', fn;
    end if;
  end loop;

  foreach fn in array app_authenticated loop
    if not has_function_privilege('authenticated', fn, 'execute') then
      raise exception 'authenticated lost execute on %', fn;
    end if;
  end loop;

  if has_function_privilege('authenticated', 'public.generate_invite_code()', 'execute') then
    raise exception 'authenticated can execute generate_invite_code()';
  end if;
  if has_function_privilege('authenticated', 'public.reserve_household_invite_account(text, text)', 'execute')
     or has_function_privilege('authenticated', 'public.release_household_invite_account(text, text)', 'execute') then
    raise exception 'authenticated can execute an invite hold function';
  end if;
  if not has_function_privilege('service_role', 'public.reserve_household_invite_account(text, text)', 'execute')
     or not has_function_privilege('service_role', 'public.release_household_invite_account(text, text)', 'execute') then
    raise exception 'service_role lost execute on an invite hold function';
  end if;

  if has_function_privilege('anon', seed, 'execute')
     or has_function_privilege('public', seed, 'execute')
     or has_function_privilege('authenticated', seed, 'execute') then
    raise exception 'anon, public, or authenticated can execute seed_default_categories';
  end if;
  if not has_function_privilege('service_role', seed, 'execute') then
    raise exception 'service_role cannot execute seed_default_categories';
  end if;

  select p.prosecdef, coalesce((
    select cfg from unnest(p.proconfig) as cfg where cfg like 'search_path=%' limit 1
  ), '')
    into seed_definer, seed_config
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'seed_default_categories';

  if not seed_definer then
    raise exception 'seed_default_categories is not security definer';
  end if;
  if seed_config is distinct from 'search_path=""' then
    raise exception 'seed_default_categories search_path is %', seed_config;
  end if;

  for caller in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosrc, p.prosecdef, p.proowner
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('create_household', 'redeem_household_invite_code')
  loop
    if not caller.prosecdef then
      raise exception '% is not security definer', caller.proname;
    end if;
    if caller.proowner is distinct from (
      select proowner from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'seed_default_categories'
    ) then
      raise exception '% owner does not match seed_default_categories', caller.proname;
    end if;
    if caller.proname = 'redeem_household_invite_code' and caller.args is distinct from 'text, text, text' then
      continue;
    end if;
    if position('seed_default_categories' in caller.prosrc) = 0 then
      raise exception '% does not call seed_default_categories', caller.proname;
    end if;
  end loop;
end $$;
