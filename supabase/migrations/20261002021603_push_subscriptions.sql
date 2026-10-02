-- Web Push subscriptions for Deanly household members.
-- Apply name: push_subscriptions
-- Project: dpjzlitklsjtfrfrxvhl
--
-- A member can read, insert, update, and delete only their own row.
-- Sending a push to someone else uses the server service role, which bypasses RLS.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  endpoint text not null check (char_length(endpoint) between 12 and 2000 and endpoint like 'https://%'),
  p256dh text not null check (char_length(p256dh) between 16 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  user_agent text check (user_agent is null or char_length(user_agent) <= 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (endpoint)
);

create index push_subscriptions_household_idx
  on public.push_subscriptions (household_id);

comment on table public.push_subscriptions is
  'Web Push endpoints. Each person can manage only their own subscription.';

create or replace function public.protect_push_subscription()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'Subscription owner cannot be reassigned.';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.protect_push_subscription() from public, anon;
grant execute on function public.protect_push_subscription() to authenticated;

create trigger push_subscriptions_protect
  before update on public.push_subscriptions
  for each row execute function public.protect_push_subscription();

alter table public.push_subscriptions enable row level security;

revoke all on table public.push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on table public.push_subscriptions to authenticated;

create policy push_subscriptions_select_own
  on public.push_subscriptions
  for select to authenticated
  using (user_id = auth.uid());

create policy push_subscriptions_insert_own
  on public.push_subscriptions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_household_member(household_id)
  );

create policy push_subscriptions_update_own
  on public.push_subscriptions
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and public.is_household_member(household_id)
  );

create policy push_subscriptions_delete_own
  on public.push_subscriptions
  for delete to authenticated
  using (user_id = auth.uid());
