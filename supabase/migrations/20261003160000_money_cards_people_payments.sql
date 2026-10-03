-- Money cards, people, and partial payments.
-- Not applied. Review before applying.
--
-- Name and balance only. Do not store a full number or a security code.
-- Household and owner are set by the app from the signed-in session.
-- Payments do not store their own visibility. A payment is readable only when
-- the caller can already see its parent bill, card, or person, so a Just me
-- payment cannot appear on its own in a shared feed.
-- No new functions. Writes are ordinary authenticated inserts, updates, and deletes.

create table public.money_cards (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  visibility public.visibility not null default 'private',
  name text not null check (char_length(btrim(name)) between 1 and 120),
  amount_cents integer not null check (amount_cents >= 0 and amount_cents <= 100000000),
  due_on date,
  note text check (note is null or char_length(note) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index money_cards_household_idx
  on public.money_cards (household_id, name);

create table public.money_people (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  visibility public.visibility not null default 'private',
  name text not null check (char_length(btrim(name)) between 1 and 120),
  amount_cents integer not null check (amount_cents >= 0 and amount_cents <= 100000000),
  due_on date,
  note text check (note is null or char_length(note) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index money_people_household_idx
  on public.money_people (household_id, name);

create table public.money_payments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  bill_id uuid references public.bills (id) on delete cascade,
  card_id uuid references public.money_cards (id) on delete cascade,
  person_id uuid references public.money_people (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0 and amount_cents <= 100000000),
  paid_on date not null,
  note text check (note is null or char_length(note) <= 280),
  created_at timestamptz not null default now(),
  constraint money_payments_one_parent check (num_nonnulls(bill_id, card_id, person_id) = 1)
);

create index money_payments_bill_idx on public.money_payments (bill_id) where bill_id is not null;
create index money_payments_card_idx on public.money_payments (card_id) where card_id is not null;
create index money_payments_person_idx on public.money_payments (person_id) where person_id is not null;

alter table public.money_cards enable row level security;
alter table public.money_people enable row level security;
alter table public.money_payments enable row level security;

revoke all on table public.money_cards from public, anon;
revoke all on table public.money_people from public, anon;
revoke all on table public.money_payments from public, anon;

grant select, insert, update, delete on table public.money_cards to authenticated;
grant select, insert, update, delete on table public.money_people to authenticated;
grant select, insert, delete on table public.money_payments to authenticated;

create trigger money_cards_set_updated_at
  before update on public.money_cards
  for each row execute function public.set_updated_at();

create trigger money_people_set_updated_at
  before update on public.money_people
  for each row execute function public.set_updated_at();

create trigger money_cards_protect
  before update on public.money_cards
  for each row execute function public.protect_household_row();

create trigger money_people_protect
  before update on public.money_people
  for each row execute function public.protect_household_row();

create policy money_cards_select
  on public.money_cards
  for select to authenticated
  using (public.can_access_row(household_id, visibility, owner_id));

create policy money_cards_insert
  on public.money_cards
  for insert to authenticated
  with check (public.is_household_member(household_id) and owner_id = auth.uid());

create policy money_cards_update
  on public.money_cards
  for update to authenticated
  using (public.can_access_row(household_id, visibility, owner_id))
  with check (public.is_household_member(household_id) and (visibility = 'shared' or owner_id = auth.uid()));

create policy money_cards_delete
  on public.money_cards
  for delete to authenticated
  using (public.can_access_row(household_id, visibility, owner_id));

create policy money_people_select
  on public.money_people
  for select to authenticated
  using (public.can_access_row(household_id, visibility, owner_id));

create policy money_people_insert
  on public.money_people
  for insert to authenticated
  with check (public.is_household_member(household_id) and owner_id = auth.uid());

create policy money_people_update
  on public.money_people
  for update to authenticated
  using (public.can_access_row(household_id, visibility, owner_id))
  with check (public.is_household_member(household_id) and (visibility = 'shared' or owner_id = auth.uid()));

create policy money_people_delete
  on public.money_people
  for delete to authenticated
  using (public.can_access_row(household_id, visibility, owner_id));

create policy money_payments_select
  on public.money_payments
  for select to authenticated
  using (
    (
      bill_id is not null
      and exists (
        select 1 from public.bills parent
        where parent.id = bill_id
          and parent.household_id = money_payments.household_id
          and public.can_access_row(parent.household_id, parent.visibility, parent.owner_id)
      )
    )
    or (
      card_id is not null
      and exists (
        select 1 from public.money_cards parent
        where parent.id = card_id
          and parent.household_id = money_payments.household_id
          and public.can_access_row(parent.household_id, parent.visibility, parent.owner_id)
      )
    )
    or (
      person_id is not null
      and exists (
        select 1 from public.money_people parent
        where parent.id = person_id
          and parent.household_id = money_payments.household_id
          and public.can_access_row(parent.household_id, parent.visibility, parent.owner_id)
      )
    )
  );

create policy money_payments_insert
  on public.money_payments
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and (
      (
        bill_id is not null
        and exists (
          select 1 from public.bills parent
          where parent.id = bill_id
            and parent.household_id = money_payments.household_id
            and public.can_access_row(parent.household_id, parent.visibility, parent.owner_id)
        )
      )
      or (
        card_id is not null
        and exists (
          select 1 from public.money_cards parent
          where parent.id = card_id
            and parent.household_id = money_payments.household_id
            and public.can_access_row(parent.household_id, parent.visibility, parent.owner_id)
        )
      )
      or (
        person_id is not null
        and exists (
          select 1 from public.money_people parent
          where parent.id = person_id
            and parent.household_id = money_payments.household_id
            and public.can_access_row(parent.household_id, parent.visibility, parent.owner_id)
        )
      )
    )
  );

create policy money_payments_delete
  on public.money_payments
  for delete to authenticated
  using (
    (
      bill_id is not null
      and exists (
        select 1 from public.bills parent
        where parent.id = bill_id
          and parent.household_id = money_payments.household_id
          and public.can_access_row(parent.household_id, parent.visibility, parent.owner_id)
      )
    )
    or (
      card_id is not null
      and exists (
        select 1 from public.money_cards parent
        where parent.id = card_id
          and parent.household_id = money_payments.household_id
          and public.can_access_row(parent.household_id, parent.visibility, parent.owner_id)
      )
    )
    or (
      person_id is not null
      and exists (
        select 1 from public.money_people parent
        where parent.id = person_id
          and parent.household_id = money_payments.household_id
          and public.can_access_row(parent.household_id, parent.visibility, parent.owner_id)
      )
    )
  );
