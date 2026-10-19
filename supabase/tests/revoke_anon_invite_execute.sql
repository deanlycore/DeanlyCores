-- Assert invite-code privileges and the signed-out peek / hold behavior.
-- Run with psql after the migrations. The script rolls back its fixture rows.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/revoke_anon_invite_execute.sql

begin;

do $$
declare
  fn text;
  locked_fns text[] := array[
    'public.protect_invite_code_row()',
    'public.generate_invite_code()',
    'public.create_household_invite_code(integer, timestamptz)',
    'public.revoke_household_invite_code(uuid)',
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
  peek text := 'public.peek_household_invite_code(text)';
  seed_config text;
  seed_definer boolean;
  caller record;
begin
  if not has_function_privilege('anon', peek, 'execute') then
    raise exception 'anon lost execute on peek_household_invite_code';
  end if;
  if not has_function_privilege('authenticated', peek, 'execute') then
    raise exception 'authenticated lost execute on peek_household_invite_code';
  end if;
  if has_function_privilege('public', peek, 'execute') then
    raise exception 'public still has execute on peek_household_invite_code';
  end if;

  foreach fn in array locked_fns loop
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

insert into auth.users (id, email)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner@example.com');

insert into public.households (id, name, owner_id)
values (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'Peek home',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);

insert into public.household_invite_codes (
  code, created_by, household_id, max_uses, uses, purpose
)
values (
  'HOME-23456789',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  2,
  0,
  'create_household'
);

set local role anon;

do $$
declare
  answer boolean;
  call text;
  calls text[] := array[
    'select public.protect_invite_code_row()',
    'select public.generate_invite_code()',
    'select public.create_household_invite_code(1, null)',
    'select public.revoke_household_invite_code(''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'')',
    'select public.redeem_household_invite_code(''HOME-23456789'', ''Peek home'', null)',
    'select public.create_household_member_code(''adult'', 1, null)',
    'select public.reserve_household_invite_account(''HOME-23456789'', ''guest@example.com'')',
    'select public.release_household_invite_account(''HOME-23456789'', ''guest@example.com'')'
  ];
begin
  answer := public.peek_household_invite_code('HOME-23456789');
  if answer is not true then
    raise exception 'anon peek of a valid code returned %', answer;
  end if;

  answer := public.peek_household_invite_code('NOPE');
  if answer is not false then
    raise exception 'anon peek of a bad code returned %', answer;
  end if;

  foreach call in array calls loop
    begin
      execute call;
      raise exception 'anon executed %', call;
    exception
      when insufficient_privilege then
        null;
    end;
  end loop;
end $$;

reset role;

select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

do $$
declare
  first_hold boolean;
  repeat_hold boolean;
begin
  first_hold := public.reserve_household_invite_account('HOME-23456789', 'guest@example.com');
  if first_hold is not true then
    raise exception 'first reserve returned %', first_hold;
  end if;

  repeat_hold := public.reserve_household_invite_account('HOME-23456789', 'guest@example.com');
  if repeat_hold is not false then
    raise exception 'repeat reserve returned %', repeat_hold;
  end if;

  perform public.release_household_invite_account('HOME-23456789', 'guest@example.com');
end $$;

reset role;

do $$
begin
  if exists (
    select 1
    from public.household_invite_account_holds hold
    join public.household_invite_codes invite on invite.id = hold.code_id
    where invite.code = 'HOME-23456789'
  ) then
    raise exception 'release left the invite hold in place';
  end if;
end $$;

rollback;
