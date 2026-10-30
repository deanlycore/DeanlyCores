-- Shared recipe library. Households copy a row into public.recipes.
-- Nothing here names a person or a household.
-- Authenticated users can read. They cannot insert, update, delete, or truncate.
-- The seed uses the service role, which is the only writer, including for storage.

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
grant usage on schema extensions to authenticated;

create table public.recipe_catalog (
  slug text primary key,
  name text not null,
  cuisine text not null,
  meal_type text not null,
  minutes integer not null,
  servings integer not null,
  ingredients jsonb not null,
  steps jsonb not null,
  kcal integer not null,
  protein integer not null,
  carbs integer not null,
  fat integer not null,
  tags text[] not null default '{}',
  image_path text not null,
  source text not null,
  license text not null,
  search tsvector generated always as (
    to_tsvector(
      'simple',
      name || ' ' || cuisine || ' ' || meal_type || ' ' ||
      coalesce(ingredients::text, '') || ' ' || coalesce(steps::text, '')
    )
  ) stored,
  constraint recipe_catalog_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint recipe_catalog_name_len check (char_length(btrim(name)) between 1 and 140),
  constraint recipe_catalog_cuisine_len check (char_length(btrim(cuisine)) between 1 and 40),
  constraint recipe_catalog_meal_type_len check (char_length(btrim(meal_type)) between 1 and 40),
  constraint recipe_catalog_minutes check (minutes between 0 and 1440),
  constraint recipe_catalog_servings check (servings between 1 and 50),
  constraint recipe_catalog_kcal check (kcal between 0 and 5000),
  constraint recipe_catalog_protein check (protein between 0 and 500),
  constraint recipe_catalog_carbs check (carbs between 0 and 500),
  constraint recipe_catalog_fat check (fat between 0 and 500),
  constraint recipe_catalog_image_path check (image_path = 'recipes/' || slug || '.webp'),
  constraint recipe_catalog_ingredients_array check (jsonb_typeof(ingredients) = 'array'),
  constraint recipe_catalog_steps_ok check (public.recipe_steps_within_limit(steps)),
  constraint recipe_catalog_source_len check (char_length(btrim(source)) between 1 and 200),
  constraint recipe_catalog_license_len check (char_length(btrim(license)) between 1 and 200)
);

create index recipe_catalog_search_idx
  on public.recipe_catalog using gin (search);

create index recipe_catalog_name_trgm_idx
  on public.recipe_catalog using gin (name extensions.gin_trgm_ops);

create index recipe_catalog_ingredients_trgm_idx
  on public.recipe_catalog using gin ((ingredients::text) extensions.gin_trgm_ops);

create index recipe_catalog_tags_idx
  on public.recipe_catalog using gin (tags);

create index recipe_catalog_cuisine_idx
  on public.recipe_catalog (cuisine);

alter table public.recipe_catalog enable row level security;
alter table public.recipe_catalog force row level security;

revoke all on table public.recipe_catalog from public, anon, authenticated;
revoke truncate on table public.recipe_catalog from public, anon, authenticated;
grant select on table public.recipe_catalog to authenticated;

create policy recipe_catalog_select
  on public.recipe_catalog
  for select
  to authenticated
  using (true);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on table public.recipe_catalog to service_role;
  end if;
end $$;

create or replace function public.search_recipe_catalog(
  p_query text default null,
  p_cuisine text default null,
  p_tag text default null
)
returns setof public.recipe_catalog
language sql
stable
security invoker
set search_path to 'public'
as $$
  select r.*
  from public.recipe_catalog r
  where (p_cuisine is null or btrim(p_cuisine) = '' or r.cuisine = p_cuisine)
    and (p_tag is null or btrim(p_tag) = '' or p_tag = any (r.tags))
    and (
      p_query is null
      or btrim(p_query) = ''
      or r.search @@ websearch_to_tsquery('simple', p_query)
      or r.name ilike '%' || replace(replace(btrim(p_query), '%', ''), '_', '') || '%'
      or r.ingredients::text ilike '%' || replace(replace(btrim(p_query), '%', ''), '_', '') || '%'
      or extensions.word_similarity(btrim(p_query), r.name) > 0.3
      or extensions.word_similarity(btrim(p_query), coalesce(r.ingredients::text, '')) > 0.3
    )
  order by
    case
      when p_query is null or btrim(p_query) = '' then 0
      else ts_rank(r.search, websearch_to_tsquery('simple', p_query))
    end desc,
    extensions.similarity(r.name, coalesce(btrim(p_query), '')) desc,
    r.name;
$$;

revoke all on function public.search_recipe_catalog(text, text, text) from public, anon;
grant execute on function public.search_recipe_catalog(text, text, text) to authenticated;

alter table public.recipes
  add column if not exists catalog_slug text;

alter table public.recipes
  drop constraint if exists recipes_catalog_slug_format;

alter table public.recipes
  add constraint recipes_catalog_slug_format
  check (catalog_slug is null or catalog_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

alter table public.recipes
  drop constraint if exists recipes_catalog_slug_fk;

alter table public.recipes
  add constraint recipes_catalog_slug_fk
  foreign key (catalog_slug)
  references public.recipe_catalog (slug)
  on delete set null;

create unique index if not exists recipes_household_catalog_slug
  on public.recipes (household_id, catalog_slug)
  where catalog_slug is not null;

-- Household comes from the caller. Membership and write access are checked before the copy.
-- A second call for the same slug returns the same household row.
drop function if exists public.copy_recipe_catalog(text);

create or replace function public.copy_recipe_catalog(p_slug text, p_household_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_household uuid := p_household_id;
  v_existing uuid;
  v_id uuid;
  v_row public.recipe_catalog%rowtype;
begin
  if v_user is null then
    raise exception 'You don’t have access to change that.';
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'That recipe is not available.';
  end if;

  if p_household_id is null
     or not public.is_household_member(p_household_id)
     or not public.can_write_household_content(p_household_id) then
    raise exception 'You don’t have access to change that.';
  end if;

  select *
    into v_row
  from public.recipe_catalog
  where slug = p_slug;

  if not found then
    raise exception 'That recipe is not available.';
  end if;

  select id
    into v_existing
  from public.recipes
  where household_id = v_household
    and catalog_slug = p_slug
  limit 1;

  if v_existing is not null then
    return jsonb_build_object('ok', true, 'id', v_existing, 'saved', true);
  end if;

  insert into public.recipes (
    household_id, created_by, visibility, catalog_slug, name, category, servings, steps, notes
  ) values (
    v_household,
    v_user,
    'shared',
    p_slug,
    v_row.name,
    v_row.cuisine,
    v_row.servings,
    v_row.steps,
    null
  )
  returning id into v_id;

  insert into public.recipe_ingredients (
    recipe_id, household_id, created_by, visibility, name, quantity, unit, category, sort_order
  )
  select
    v_id,
    v_household,
    v_user,
    'shared',
    left(btrim(item.value->>'text'), 140),
    case
      when coalesce(item.value->>'grams', '') ~ '^[0-9]+(\.[0-9]+)?$' then item.value->>'grams'
      else null
    end,
    case
      when coalesce(item.value->>'grams', '') ~ '^[0-9]+(\.[0-9]+)?$' then 'g'
      else null
    end,
    null,
    (item.ordinality - 1)::integer
  from jsonb_array_elements(v_row.ingredients) with ordinality as item(value, ordinality)
  where btrim(coalesce(item.value->>'text', '')) <> ''
    and item.ordinality <= 80;

  return jsonb_build_object('ok', true, 'id', v_id, 'saved', false);
exception
  when unique_violation then
    select id
      into v_existing
    from public.recipes
    where household_id = v_household
      and catalog_slug = p_slug
    limit 1;
    if v_existing is null then
      raise;
    end if;
    return jsonb_build_object('ok', true, 'id', v_existing, 'saved', true);
end;
$$;

revoke all on function public.copy_recipe_catalog(text, uuid) from public, anon;
grant execute on function public.copy_recipe_catalog(text, uuid) to authenticated;

-- Public read of recipe photos. No insert, update, or delete policy, so only the service role can write.
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'recipe-catalog',
    'recipe-catalog',
    true,
    1048576,
    array['image/jpeg', 'image/webp']::text[]
  )
  on conflict (id) do update
  set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  execute 'alter table storage.objects enable row level security';
  -- The bucket is public, so a known photo URL still serves the file.
  -- A SELECT policy on storage.objects would let anyone list the whole bucket.
  execute 'drop policy if exists recipe_catalog_objects_select on storage.objects';
end $$;
