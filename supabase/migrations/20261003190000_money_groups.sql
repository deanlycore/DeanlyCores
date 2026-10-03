-- Groups inside the six Money sections.
-- Not applied. Review before applying.
--
-- Category is plain text on the row that already holds the money.
-- Blank means Other. There is no shared category catalog.
-- People use a direction, not a free label. Existing people stay owe.
-- A card limit is optional cents. Leave it null when it is unset.
-- A subscription cadence is month or year. Existing rows stay month,
-- so a yearly amount is never divided into the monthly line.
--
-- No new functions. No new privileges. No service role.
-- Household and owner stay on the existing protect trigger.
-- Saving category, direction, limit, or cadence does not open a new
-- visibility path and does not reassign household or owner.
-- Payments stay without update, truncate, references, and trigger.

alter table public.bills
  add column category text;

alter table public.bills
  add constraint bills_category_plain
  check (
    category is null
    or (
      char_length(category) between 1 and 40
      and category = btrim(category)
      and position('<' in category) = 0
      and position('>' in category) = 0
    )
  );

alter table public.expenses
  add column category text;

alter table public.expenses
  add constraint expenses_category_plain
  check (
    category is null
    or (
      char_length(category) between 1 and 40
      and category = btrim(category)
      and position('<' in category) = 0
      and position('>' in category) = 0
    )
  );

alter table public.goals
  add column category text;

alter table public.goals
  add constraint goals_category_plain
  check (
    category is null
    or (
      char_length(category) between 1 and 40
      and category = btrim(category)
      and position('<' in category) = 0
      and position('>' in category) = 0
    )
  );

alter table public.subscriptions
  add column category text;

alter table public.subscriptions
  add constraint subscriptions_category_plain
  check (
    category is null
    or (
      char_length(category) between 1 and 40
      and category = btrim(category)
      and position('<' in category) = 0
      and position('>' in category) = 0
    )
  );

alter table public.subscriptions
  add column cadence text not null default 'month';

alter table public.subscriptions
  add constraint subscriptions_cadence_check
  check (cadence in ('month', 'year'));

alter table public.money_cards
  add column category text;

alter table public.money_cards
  add constraint money_cards_category_plain
  check (
    category is null
    or (
      char_length(category) between 1 and 40
      and category = btrim(category)
      and position('<' in category) = 0
      and position('>' in category) = 0
    )
  );

alter table public.money_cards
  add column limit_cents integer;

alter table public.money_cards
  add constraint money_cards_limit_cents_range
  check (limit_cents is null or (limit_cents >= 0 and limit_cents <= 100000000));

alter table public.money_people
  add column direction text not null default 'owe';

alter table public.money_people
  add constraint money_people_direction_check
  check (direction in ('owe', 'owed'));

revoke update, truncate, references, trigger on table public.money_payments from authenticated, anon, public;
revoke truncate, references, trigger on table public.money_cards from authenticated, anon, public;
revoke truncate, references, trigger on table public.money_people from authenticated, anon, public;
