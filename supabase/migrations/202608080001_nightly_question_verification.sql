create unique index if not exists daily_challenges_id_challenge_date_unique
  on public.daily_challenges (id, challenge_date);

create or replace function public.daily_challenge_text_is_valid(
  p_value text,
  p_max_length integer,
  p_require_nonempty boolean
)
returns boolean
language sql
immutable
strict
set search_path = public, pg_temp
as $function$
  select p_max_length >= 0
    and char_length(
      regexp_replace(
        regexp_replace(p_value, '^[[:space:]]+', '', 'g'),
        '[[:space:]]+$',
        '',
        'g'
      )
    ) <= p_max_length
    and (
      not p_require_nonempty
      or p_value ~ '[^[:space:]]'
    );
$function$;

revoke all on function public.daily_challenge_text_is_valid(text, integer, boolean)
  from public, anon, authenticated;

create or replace function public.daily_challenge_is_complete(
  p_challenge_id uuid
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $function$
  select count(*) = 5
    and count(distinct i.slot) = 5
    and min(i.slot) = 1
    and max(i.slot) = 5
    and count(distinct i.question_id) = 5
    and count(*) filter (
      where jsonb_typeof(i.question_snapshot) = 'object'
        and i.question_snapshot ?& array[
          'id',
          'question_text',
          'option_a',
          'option_b',
          'option_c',
          'option_d',
          'correct_option',
          'sport',
          'difficulty',
          'source_notes'
        ]
        and jsonb_typeof(i.question_snapshot->'id') = 'string'
        and i.question_snapshot->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and i.question_snapshot->>'id' = i.question_id::text
        and jsonb_typeof(i.question_snapshot->'question_text') = 'string'
        and public.daily_challenge_text_is_valid(
          i.question_snapshot->>'question_text',
          1000,
          true
        )
        and jsonb_typeof(i.question_snapshot->'option_a') = 'string'
        and public.daily_challenge_text_is_valid(
          i.question_snapshot->>'option_a',
          500,
          true
        )
        and jsonb_typeof(i.question_snapshot->'option_b') = 'string'
        and public.daily_challenge_text_is_valid(
          i.question_snapshot->>'option_b',
          500,
          true
        )
        and jsonb_typeof(i.question_snapshot->'option_c') = 'string'
        and public.daily_challenge_text_is_valid(
          i.question_snapshot->>'option_c',
          500,
          true
        )
        and jsonb_typeof(i.question_snapshot->'option_d') = 'string'
        and public.daily_challenge_text_is_valid(
          i.question_snapshot->>'option_d',
          500,
          true
        )
        and i.question_snapshot->>'correct_option' in ('A', 'B', 'C', 'D')
        and i.question_snapshot->>'difficulty' in ('easy', 'medium', 'hard')
        and jsonb_typeof(i.question_snapshot->'sport') = 'object'
        and i.question_snapshot->'sport' ?& array['slug', 'name']
        and jsonb_typeof(i.question_snapshot->'sport'->'slug') = 'string'
        and public.daily_challenge_text_is_valid(
          i.question_snapshot->'sport'->>'slug',
          50,
          true
        )
        and jsonb_typeof(i.question_snapshot->'sport'->'name') = 'string'
        and public.daily_challenge_text_is_valid(
          i.question_snapshot->'sport'->>'name',
          100,
          true
        )
        and (
          jsonb_typeof(i.question_snapshot->'source_notes') = 'null'
          or (
            jsonb_typeof(i.question_snapshot->'source_notes') = 'string'
            and public.daily_challenge_text_is_valid(
              i.question_snapshot->>'source_notes',
              4000,
              false
            )
          )
        )
    ) = 5
  from public.daily_challenge_items i
  where i.daily_challenge_id = p_challenge_id;
$function$;

revoke all on function public.daily_challenge_is_complete(uuid)
  from public, anon, authenticated;

create or replace function public.prepare_daily_challenge_draft(
  p_challenge_date date,
  p_generation_method text,
  p_rules_version text,
  p_generated_at timestamptz,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  canonical_id uuid;
  canonical_status text;
  canonical_published_at timestamptz;
  payload_count bigint;
  payload_slot_count bigint;
  payload_question_count bigint;
  valid_payload_count bigint;
begin
  if p_challenge_date is null
    or p_generation_method is null
    or p_generation_method not in ('manual', 'semi_auto', 'auto')
    or p_rules_version is null
    or char_length(btrim(p_rules_version)) not between 1 and 100
    or p_generated_at is null
    or p_items is null
    or jsonb_typeof(p_items) <> 'array'
  then
    return jsonb_build_object('outcome', 'incomplete', 'challenge_id', null);
  end if;

  if jsonb_array_length(p_items) <> 5 then
    return jsonb_build_object('outcome', 'incomplete', 'challenge_id', null);
  end if;

  select
    count(*),
    count(distinct case
      when item->>'slot' ~ '^[1-5]$' then (item->>'slot')::smallint
    end),
    count(distinct lower(item->>'question_id')),
    count(*) filter (
      where jsonb_typeof(item) = 'object'
        and item ?& array['slot', 'question_id', 'question_snapshot']
        and jsonb_typeof(item->'slot') = 'number'
        and item->>'slot' ~ '^[1-5]$'
        and jsonb_typeof(item->'question_id') = 'string'
        and item->>'question_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and jsonb_typeof(item->'question_snapshot') = 'object'
        and item->'question_snapshot' ?& array[
          'id',
          'question_text',
          'option_a',
          'option_b',
          'option_c',
          'option_d',
          'correct_option',
          'sport',
          'difficulty',
          'source_notes'
        ]
        and jsonb_typeof(item->'question_snapshot'->'id') = 'string'
        and item->'question_snapshot'->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and item->'question_snapshot'->>'id' = item->>'question_id'
        and jsonb_typeof(item->'question_snapshot'->'question_text') = 'string'
        and public.daily_challenge_text_is_valid(
          item->'question_snapshot'->>'question_text',
          1000,
          true
        )
        and jsonb_typeof(item->'question_snapshot'->'option_a') = 'string'
        and public.daily_challenge_text_is_valid(
          item->'question_snapshot'->>'option_a',
          500,
          true
        )
        and jsonb_typeof(item->'question_snapshot'->'option_b') = 'string'
        and public.daily_challenge_text_is_valid(
          item->'question_snapshot'->>'option_b',
          500,
          true
        )
        and jsonb_typeof(item->'question_snapshot'->'option_c') = 'string'
        and public.daily_challenge_text_is_valid(
          item->'question_snapshot'->>'option_c',
          500,
          true
        )
        and jsonb_typeof(item->'question_snapshot'->'option_d') = 'string'
        and public.daily_challenge_text_is_valid(
          item->'question_snapshot'->>'option_d',
          500,
          true
        )
        and item->'question_snapshot'->>'correct_option' in ('A', 'B', 'C', 'D')
        and item->'question_snapshot'->>'difficulty' in ('easy', 'medium', 'hard')
        and jsonb_typeof(item->'question_snapshot'->'sport') = 'object'
        and item->'question_snapshot'->'sport' ?& array['slug', 'name']
        and jsonb_typeof(item->'question_snapshot'->'sport'->'slug') = 'string'
        and public.daily_challenge_text_is_valid(
          item->'question_snapshot'->'sport'->>'slug',
          50,
          true
        )
        and jsonb_typeof(item->'question_snapshot'->'sport'->'name') = 'string'
        and public.daily_challenge_text_is_valid(
          item->'question_snapshot'->'sport'->>'name',
          100,
          true
        )
        and (
          jsonb_typeof(item->'question_snapshot'->'source_notes') = 'null'
          or (
            jsonb_typeof(item->'question_snapshot'->'source_notes') = 'string'
            and public.daily_challenge_text_is_valid(
              item->'question_snapshot'->>'source_notes',
              4000,
              false
            )
          )
        )
    )
  into payload_count, payload_slot_count, payload_question_count, valid_payload_count
  from jsonb_array_elements(p_items) as payload(item);

  if payload_count <> 5
    or payload_slot_count <> 5
    or payload_question_count <> 5
    or valid_payload_count <> 5
  then
    return jsonb_build_object('outcome', 'incomplete', 'challenge_id', null);
  end if;

  select c.id, c.status, c.published_at
  into canonical_id, canonical_status, canonical_published_at
  from public.daily_challenges c
  where c.challenge_date = p_challenge_date
  for update;

  if found then
    if canonical_status = 'generated'
      and canonical_published_at is null
      and public.daily_challenge_is_complete(canonical_id)
    then
      return jsonb_build_object('outcome', 'existing', 'challenge_id', canonical_id);
    end if;

    return jsonb_build_object(
      'outcome',
      case
        when canonical_status = 'generated' and canonical_published_at is null
          then 'incomplete'
        else 'conflict'
      end,
      'challenge_id',
      canonical_id
    );
  end if;

  begin
    insert into public.daily_challenges (
      challenge_date,
      status,
      generation_method,
      rules_version,
      generated_at,
      published_at
    )
    values (
      p_challenge_date,
      'generated',
      p_generation_method,
      btrim(p_rules_version),
      p_generated_at,
      null
    )
    returning id into canonical_id;
  exception
    when unique_violation then
      select c.id, c.status, c.published_at
      into canonical_id, canonical_status, canonical_published_at
      from public.daily_challenges c
      where c.challenge_date = p_challenge_date
      for update;

      if not found then
        return jsonb_build_object('outcome', 'conflict', 'challenge_id', null);
      end if;

      if canonical_status = 'generated'
        and canonical_published_at is null
        and public.daily_challenge_is_complete(canonical_id)
      then
        return jsonb_build_object('outcome', 'existing', 'challenge_id', canonical_id);
      end if;

      return jsonb_build_object(
        'outcome',
        case
          when canonical_status = 'generated' and canonical_published_at is null
            then 'incomplete'
          else 'conflict'
        end,
        'challenge_id',
        canonical_id
      );
  end;

  insert into public.daily_challenge_items (
    daily_challenge_id,
    slot,
    question_id,
    question_snapshot
  )
  select
    canonical_id,
    (item->>'slot')::smallint,
    (item->>'question_id')::uuid,
    item->'question_snapshot'
  from jsonb_array_elements(p_items) as payload(item)
  order by (item->>'slot')::smallint;

  if not public.daily_challenge_is_complete(canonical_id) then
    delete from public.daily_challenges
    where id = canonical_id;
    return jsonb_build_object('outcome', 'incomplete', 'challenge_id', null);
  end if;

  return jsonb_build_object('outcome', 'created', 'challenge_id', canonical_id);
end;
$function$;

revoke all on function public.prepare_daily_challenge_draft(date, text, text, timestamptz, jsonb)
  from public, anon, authenticated;

grant execute on function public.prepare_daily_challenge_draft(date, text, text, timestamptz, jsonb)
  to service_role;

comment on function public.prepare_daily_challenge_draft(date, text, text, timestamptz, jsonb) is
  'Service-role-only atomic preparation of one complete unpublished canonical Daily 5 draft.';

create or replace function public.cleanup_stale_daily_challenge(
  p_challenge_id uuid,
  p_challenge_date date,
  p_generated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  challenge_date_value date;
  challenge_status text;
  challenge_generated_at timestamptz;
  challenge_published_at timestamptz;
begin
  select c.challenge_date, c.status, c.generated_at, c.published_at
  into challenge_date_value, challenge_status, challenge_generated_at, challenge_published_at
  from public.daily_challenges c
  where c.id = p_challenge_id
  for update;

  if not found then
    return jsonb_build_object('outcome', 'missing', 'challenge_id', null);
  end if;

  if challenge_date_value <> p_challenge_date
    or challenge_status <> 'generated'
    or challenge_generated_at is distinct from p_generated_at
    or challenge_published_at is not null
  then
    return jsonb_build_object('outcome', 'conflict', 'challenge_id', p_challenge_id);
  end if;

  if public.daily_challenge_is_complete(p_challenge_id) then
    return jsonb_build_object('outcome', 'complete', 'challenge_id', p_challenge_id);
  end if;

  delete from public.daily_challenges
  where id = p_challenge_id;

  return jsonb_build_object('outcome', 'deleted', 'challenge_id', p_challenge_id);
end;
$function$;

revoke all on function public.cleanup_stale_daily_challenge(uuid, date, timestamptz)
  from public, anon, authenticated;

grant execute on function public.cleanup_stale_daily_challenge(uuid, date, timestamptz)
  to service_role;

comment on function public.cleanup_stale_daily_challenge(uuid, date, timestamptz) is
  'Service-role-only atomic cleanup of an unchanged and still-incomplete generated Daily 5 draft.';

create or replace function public.publish_daily_challenge(
  p_challenge_id uuid,
  p_challenge_date date,
  p_published_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  challenge_status text;
  challenge_published_at timestamptz;
begin
  if p_published_at is null then
    return 'conflict';
  end if;

  select c.status, c.published_at
  into challenge_status, challenge_published_at
  from public.daily_challenges c
  where c.id = p_challenge_id
    and c.challenge_date = p_challenge_date
  for update;

  if not found then
    return 'conflict';
  end if;

  if challenge_status = 'published' and challenge_published_at is not null then
    return 'published';
  end if;

  if challenge_status <> 'generated' or challenge_published_at is not null then
    return 'conflict';
  end if;

  -- All mutation RPCs lock the parent first, then item rows in slot order.
  perform 1
  from public.daily_challenge_items i
  where i.daily_challenge_id = p_challenge_id
  order by i.slot
  for update;

  if not public.daily_challenge_is_complete(p_challenge_id) then
    return 'incomplete';
  end if;

  update public.daily_challenges
  set status = 'published',
      published_at = p_published_at
  where id = p_challenge_id
    and challenge_date = p_challenge_date
    and status = 'generated'
    and published_at is null;

  if not found then
    return 'conflict';
  end if;

  return 'published';
end;
$function$;

revoke all on function public.publish_daily_challenge(uuid, date, timestamptz)
  from public, anon, authenticated;

grant execute on function public.publish_daily_challenge(uuid, date, timestamptz)
  to service_role;

comment on function public.publish_daily_challenge(uuid, date, timestamptz) is
  'Service-role-only atomic publication gate for complete canonical Daily 5 challenges.';

create table if not exists public.daily_question_review_runs (
  id uuid primary key default gen_random_uuid(),
  daily_challenge_id uuid not null references public.daily_challenges (id) on delete cascade,
  review_date date not null,
  challenge_date date not null,
  status text not null default 'preparing'
    check (status in ('preparing', 'running', 'completed', 'completed_with_flags', 'failed')),
  run_kind text not null default 'scheduled'
    check (run_kind in ('scheduled')),
  model text not null check (char_length(model) between 1 and 100),
  verifier_version text not null check (char_length(verifier_version) between 1 and 100),
  started_at timestamptz,
  claim_token uuid not null,
  heartbeat_at timestamptz not null,
  lease_expires_at timestamptz not null,
  completed_at timestamptz,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  cached_input_tokens integer not null default 0 check (cached_input_tokens >= 0),
  cache_write_tokens integer not null default 0 check (cache_write_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  search_count integer not null default 0 check (search_count >= 0),
  estimated_cost_microdollars bigint not null default 0
    check (estimated_cost_microdollars between 0 and 999999999999),
  estimated_cost_usd numeric(12, 6) not null default 0
    check (estimated_cost_usd >= 0),
  check (
    estimated_cost_usd = estimated_cost_microdollars::numeric / 1000000
  ),
  email_status text not null default 'pending'
    check (email_status in ('pending', 'sending', 'sent', 'failed')),
  email_sent_at timestamptz,
  email_metadata jsonb not null default
    '{"provider":"resend","providerMessageId":null,"attempts":0,"lastAttemptAt":null,"failure":null}'::jsonb
    check (
      jsonb_typeof(email_metadata) = 'object'
      and email_metadata ?& array[
        'provider',
        'providerMessageId',
        'attempts',
        'lastAttemptAt',
        'failure'
      ]
      and email_metadata->>'provider' = 'resend'
      and jsonb_typeof(email_metadata->'attempts') = 'number'
      and (email_metadata->>'attempts')::integer between 0 and 10
      and (
        jsonb_typeof(email_metadata->'providerMessageId') = 'null'
        or (
          jsonb_typeof(email_metadata->'providerMessageId') = 'string'
          and char_length(email_metadata->>'providerMessageId') between 1 and 200
        )
      )
      and (
        jsonb_typeof(email_metadata->'lastAttemptAt') = 'null'
        or (
          jsonb_typeof(email_metadata->'lastAttemptAt') = 'string'
          and char_length(email_metadata->>'lastAttemptAt') between 1 and 50
        )
      )
      and (
        jsonb_typeof(email_metadata->'failure') = 'null'
        or (
          jsonb_typeof(email_metadata->'failure') = 'object'
          and email_metadata->'failure' ?& array['code', 'message', 'occurredAt']
          and jsonb_typeof(email_metadata->'failure'->'code') = 'string'
          and char_length(email_metadata->'failure'->>'code') between 1 and 100
          and jsonb_typeof(email_metadata->'failure'->'message') = 'string'
          and char_length(email_metadata->'failure'->>'message') between 1 and 1000
          and jsonb_typeof(email_metadata->'failure'->'occurredAt') = 'string'
          and char_length(email_metadata->'failure'->>'occurredAt') between 1 and 50
        )
      )
      and octet_length(email_metadata::text) <= 4000
    ),
  errors jsonb not null default '[]'::jsonb
    check (
      jsonb_typeof(errors) = 'array'
      and jsonb_array_length(errors) <= 20
      and octet_length(errors::text) <= 20000
    ),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (review_date, run_kind),
  unique (challenge_date, run_kind),
  unique (id, daily_challenge_id),
  foreign key (daily_challenge_id, challenge_date)
    references public.daily_challenges (id, challenge_date)
    on delete cascade,
  check (review_date < challenge_date),
  check (lease_expires_at > heartbeat_at),
  check (
    (
      status = 'preparing'
      and started_at is null
      and completed_at is null
    )
    or (
      status = 'running'
      and started_at is not null
      and completed_at is null
    )
    or (
      status in ('completed', 'completed_with_flags')
      and started_at is not null
      and completed_at is not null
      and completed_at >= started_at
    )
    or (
      status = 'failed'
      and completed_at is not null
      and (started_at is null or completed_at >= started_at)
    )
  ),
  check (
    (
      email_status = 'pending'
      and email_sent_at is null
      and (email_metadata->>'attempts')::integer = 0
      and jsonb_typeof(email_metadata->'providerMessageId') = 'null'
      and jsonb_typeof(email_metadata->'lastAttemptAt') = 'null'
      and jsonb_typeof(email_metadata->'failure') = 'null'
    )
    or (
      email_status = 'sending'
      and email_sent_at is null
      and (email_metadata->>'attempts')::integer >= 1
      and jsonb_typeof(email_metadata->'providerMessageId') = 'null'
      and jsonb_typeof(email_metadata->'lastAttemptAt') = 'string'
      and jsonb_typeof(email_metadata->'failure') = 'null'
    )
    or (
      email_status = 'sent'
      and email_sent_at is not null
      and (email_metadata->>'attempts')::integer >= 1
      and email_metadata->>'providerMessageId' is not null
      and jsonb_typeof(email_metadata->'lastAttemptAt') = 'string'
      and jsonb_typeof(email_metadata->'failure') = 'null'
    )
    or (
      email_status = 'failed'
      and email_sent_at is null
      and (email_metadata->>'attempts')::integer >= 1
      and jsonb_typeof(email_metadata->'providerMessageId') = 'null'
      and jsonb_typeof(email_metadata->'lastAttemptAt') = 'string'
      and jsonb_typeof(email_metadata->'failure') = 'object'
    )
  )
);

create table if not exists public.daily_question_review_reservations (
  id uuid primary key default gen_random_uuid(),
  review_date date not null,
  challenge_date date not null,
  run_kind text not null default 'scheduled'
    check (run_kind in ('scheduled')),
  model text not null check (char_length(btrim(model)) between 1 and 100),
  status text not null
    check (status in ('active', 'reconciled', 'released', 'denied')),
  reserved_microdollars bigint not null
    check (reserved_microdollars between 0 and 9007199254740991),
  run_cost_baseline_microdollars bigint not null default 0
    check (run_cost_baseline_microdollars between 0 and 999999999999),
  actual_microdollars bigint not null default 0
    check (actual_microdollars between 0 and reserved_microdollars),
  month_start timestamptz not null,
  month_end timestamptz not null,
  acquired_at timestamptz not null,
  reconciled_at timestamptz,
  denial_reason text check (
    denial_reason is null
    or char_length(btrim(denial_reason)) between 1 and 100
  ),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (review_date < challenge_date),
  check (month_start < month_end),
  check (
    (
      status = 'active'
      and reserved_microdollars > 0
      and actual_microdollars = 0
      and reconciled_at is null
      and denial_reason is null
    )
    or (
      status = 'reconciled'
      and actual_microdollars > 0
      and reconciled_at is not null
      and denial_reason is null
    )
    or (
      status = 'released'
      and actual_microdollars = 0
      and reconciled_at is not null
      and denial_reason is null
    )
    or (
      status = 'denied'
      and actual_microdollars = 0
      and reconciled_at is not null
      and denial_reason is not null
    )
  )
);

create table if not exists public.daily_question_review_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.daily_question_review_runs (id) on delete cascade,
  daily_challenge_id uuid not null references public.daily_challenges (id) on delete cascade,
  slot smallint not null check (slot between 1 and 5),
  question_id uuid not null references public.questions (id) on delete restrict,
  question_snapshot jsonb not null
    check (
      jsonb_typeof(question_snapshot) = 'object'
      and question_snapshot ?& array[
        'id',
        'question_text',
        'option_a',
        'option_b',
        'option_c',
        'option_d',
        'correct_option',
        'sport',
        'difficulty',
        'source_notes'
      ]
      and jsonb_typeof(question_snapshot->'id') = 'string'
      and question_snapshot->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and (question_snapshot->>'id')::uuid = question_id
      and jsonb_typeof(question_snapshot->'question_text') = 'string'
      and char_length(btrim(question_snapshot->>'question_text')) between 1 and 1000
      and jsonb_typeof(question_snapshot->'option_a') = 'string'
      and char_length(btrim(question_snapshot->>'option_a')) between 1 and 500
      and jsonb_typeof(question_snapshot->'option_b') = 'string'
      and char_length(btrim(question_snapshot->>'option_b')) between 1 and 500
      and jsonb_typeof(question_snapshot->'option_c') = 'string'
      and char_length(btrim(question_snapshot->>'option_c')) between 1 and 500
      and jsonb_typeof(question_snapshot->'option_d') = 'string'
      and char_length(btrim(question_snapshot->>'option_d')) between 1 and 500
      and question_snapshot->>'correct_option' in ('A', 'B', 'C', 'D')
      and question_snapshot->>'difficulty' in ('easy', 'medium', 'hard')
      and jsonb_typeof(question_snapshot->'sport') = 'object'
      and question_snapshot->'sport' ?& array['slug', 'name']
      and jsonb_typeof(question_snapshot->'sport'->'slug') = 'string'
      and char_length(btrim(question_snapshot->'sport'->>'slug')) between 1 and 50
      and jsonb_typeof(question_snapshot->'sport'->'name') = 'string'
      and char_length(btrim(question_snapshot->'sport'->>'name')) between 1 and 100
      and (
        jsonb_typeof(question_snapshot->'source_notes') = 'null'
        or (
          jsonb_typeof(question_snapshot->'source_notes') = 'string'
          and char_length(question_snapshot->>'source_notes') <= 4000
        )
      )
    ),
  review_status text not null default 'pending'
    check (review_status in ('pending', 'reviewing', 'completed', 'failed')),
  verdict text
    check (verdict in ('passed', 'risk', 'unable_to_verify')),
  confidence numeric(4, 3) check (confidence is null or confidence between 0 and 1),
  explanation text check (explanation is null or char_length(explanation) <= 2000),
  conflicts jsonb not null default '[]'::jsonb
    check (
      jsonb_typeof(conflicts) = 'array'
      and jsonb_array_length(conflicts) <= 10
    ),
  source_fetch_results jsonb not null default '[]'::jsonb
    check (
      jsonb_typeof(source_fetch_results) = 'array'
      and jsonb_array_length(source_fetch_results) <= 20
    ),
  evidence jsonb not null default '[]'::jsonb
    check (
      jsonb_typeof(evidence) = 'array'
      and jsonb_array_length(evidence) <= 10
    ),
  verified_at timestamptz,
  replacement_question_id uuid references public.questions (id) on delete restrict,
  replacement_eligible boolean not null default false,
  replacement_question_snapshot jsonb
    check (
      replacement_question_snapshot is null
      or (
        jsonb_typeof(replacement_question_snapshot) = 'object'
        and replacement_question_snapshot ?& array[
          'id',
          'question_text',
          'option_a',
          'option_b',
          'option_c',
          'option_d',
          'correct_option',
          'sport',
          'difficulty',
          'source_notes'
        ]
        and jsonb_typeof(replacement_question_snapshot->'id') = 'string'
        and replacement_question_snapshot->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and jsonb_typeof(replacement_question_snapshot->'question_text') = 'string'
        and char_length(btrim(replacement_question_snapshot->>'question_text')) between 1 and 1000
        and jsonb_typeof(replacement_question_snapshot->'option_a') = 'string'
        and char_length(btrim(replacement_question_snapshot->>'option_a')) between 1 and 500
        and jsonb_typeof(replacement_question_snapshot->'option_b') = 'string'
        and char_length(btrim(replacement_question_snapshot->>'option_b')) between 1 and 500
        and jsonb_typeof(replacement_question_snapshot->'option_c') = 'string'
        and char_length(btrim(replacement_question_snapshot->>'option_c')) between 1 and 500
        and jsonb_typeof(replacement_question_snapshot->'option_d') = 'string'
        and char_length(btrim(replacement_question_snapshot->>'option_d')) between 1 and 500
        and replacement_question_snapshot->>'correct_option' in ('A', 'B', 'C', 'D')
        and replacement_question_snapshot->>'difficulty' in ('easy', 'medium', 'hard')
        and jsonb_typeof(replacement_question_snapshot->'sport') = 'object'
        and replacement_question_snapshot->'sport' ?& array['slug', 'name']
        and jsonb_typeof(replacement_question_snapshot->'sport'->'slug') = 'string'
        and char_length(btrim(replacement_question_snapshot->'sport'->>'slug')) between 1 and 50
        and jsonb_typeof(replacement_question_snapshot->'sport'->'name') = 'string'
        and char_length(btrim(replacement_question_snapshot->'sport'->>'name')) between 1 and 100
        and (
          jsonb_typeof(replacement_question_snapshot->'source_notes') = 'null'
          or (
            jsonb_typeof(replacement_question_snapshot->'source_notes') = 'string'
            and char_length(replacement_question_snapshot->>'source_notes') <= 4000
          )
        )
      )
    ),
  replacement_finding jsonb
    check (
      replacement_finding is null
      or (
        jsonb_typeof(replacement_finding) = 'object'
        and replacement_finding ?& array[
          'questionId',
          'verdict',
          'confidence',
          'explanation',
          'conflicts',
          'evidence',
          'verifiedAt'
        ]
        and jsonb_typeof(replacement_finding->'questionId') = 'string'
        and replacement_finding->>'questionId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and jsonb_typeof(replacement_finding->'verdict') = 'string'
        and replacement_finding->>'verdict' in ('passed', 'risk', 'unable_to_verify')
        and jsonb_typeof(replacement_finding->'confidence') = 'number'
        and (replacement_finding->>'confidence')::numeric between 0 and 1
        and jsonb_typeof(replacement_finding->'explanation') = 'string'
        and char_length(btrim(replacement_finding->>'explanation')) between 1 and 2000
        and jsonb_typeof(replacement_finding->'conflicts') = 'array'
        and jsonb_array_length(replacement_finding->'conflicts') <= 10
        and jsonb_typeof(replacement_finding->'evidence') = 'array'
        and jsonb_array_length(replacement_finding->'evidence') <= 10
        and jsonb_typeof(replacement_finding->'verifiedAt') = 'string'
        and char_length(replacement_finding->>'verifiedAt') between 1 and 50
      )
    ),
  resolution text not null default 'pending'
    check (resolution in ('pending', 'kept', 'replaced')),
  resolved_by uuid references auth.users (id) on delete restrict,
  resolved_at timestamptz,
  application_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(application_metadata) = 'object'),
  applied_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (run_id, slot),
  foreign key (run_id, daily_challenge_id)
    references public.daily_question_review_runs (id, daily_challenge_id)
    on delete cascade,
  check (
    (
      review_status in ('pending', 'reviewing', 'failed')
      and verdict is null
      and confidence is null
      and explanation is null
      and jsonb_array_length(conflicts) = 0
      and jsonb_array_length(evidence) = 0
      and verified_at is null
    )
    or (
      review_status = 'completed'
      and verdict is not null
      and confidence is not null
      and explanation is not null
      and verified_at is not null
    )
  ),
  check (
    verdict is null
    or verdict = 'unable_to_verify'
    or jsonb_array_length(evidence) > 0
  ),
  check (
    resolution <> 'replaced'
    or (
      replacement_eligible
      and replacement_question_id is not null
      and replacement_question_snapshot is not null
      and replacement_finding is not null
    )
  ),
  check (
    (
      replacement_question_id is null
      and replacement_question_snapshot is null
      and replacement_finding is null
      and not replacement_eligible
    )
    or (
      replacement_question_id is not null
      and replacement_question_snapshot is not null
      and replacement_finding is not null
      and replacement_question_id <> question_id
      and (replacement_question_snapshot->>'id')::uuid = replacement_question_id
      and (replacement_finding->>'questionId')::uuid = replacement_question_id
      and replacement_question_snapshot->>'difficulty' = question_snapshot->>'difficulty'
      and (
        not replacement_eligible
        or (
          replacement_finding->>'verdict' = 'passed'
          and jsonb_array_length(replacement_finding->'evidence') > 0
        )
      )
    )
  ),
  check (
    (
      resolution = 'pending'
      and resolved_by is null
      and resolved_at is null
      and applied_at is null
      and application_metadata = '{}'::jsonb
    )
    or (
      resolution = 'kept'
      and review_status = 'completed'
      and resolved_by is not null
      and resolved_at is not null
      and applied_at is null
      and application_metadata = '{}'::jsonb
      and resolved_at >= created_at
    )
    or (
      resolution = 'replaced'
      and review_status = 'completed'
      and resolved_by is not null
      and resolved_at is not null
      and applied_at is not null
      and resolved_at >= created_at
      and applied_at >= resolved_at
    )
  )
);

create table if not exists public.daily_question_review_usage_events (
  id uuid primary key,
  run_id uuid not null references public.daily_question_review_runs (id) on delete cascade,
  slot smallint not null check (slot between 1 and 5),
  phase text not null check (phase in ('primary', 'replacement')),
  input_tokens integer not null check (input_tokens >= 0),
  cached_input_tokens integer not null check (cached_input_tokens >= 0),
  cache_write_tokens integer not null check (cache_write_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  search_count integer not null check (search_count >= 0),
  estimated_cost_microdollars bigint not null
    check (estimated_cost_microdollars between 0 and 999999999999),
  created_at timestamptz not null default timezone('utc', now()),
  check (cached_input_tokens + cache_write_tokens <= input_tokens)
);

create or replace function public.persist_daily_question_review_progress(
  p_run_id uuid,
  p_claim_token uuid,
  p_heartbeat_at timestamptz,
  p_lease_expires_at timestamptz,
  p_daily_challenge_id uuid,
  p_slot smallint,
  p_question_id uuid,
  p_question_snapshot jsonb,
  p_review_status text,
  p_source_fetch_results jsonb,
  p_verdict text,
  p_confidence numeric,
  p_explanation text,
  p_conflicts jsonb,
  p_evidence jsonb,
  p_verified_at timestamptz,
  p_replacement_question_id uuid,
  p_replacement_eligible boolean,
  p_replacement_question_snapshot jsonb,
  p_replacement_finding jsonb,
  p_usage_event_id uuid,
  p_usage_phase text,
  p_input_tokens integer,
  p_cached_input_tokens integer,
  p_cache_write_tokens integer,
  p_output_tokens integer,
  p_search_count integer,
  p_estimated_cost_microdollars bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_run public.daily_question_review_runs%rowtype;
  v_item public.daily_question_review_items%rowtype;
  v_usage_applied boolean := false;
  v_inserted integer := 0;
begin
  select r.* into v_run
  from public.daily_question_review_runs r
  where r.id = p_run_id
    and r.status = 'running'
    and r.claim_token = p_claim_token
    and r.lease_expires_at > p_heartbeat_at
    and r.lease_expires_at > clock_timestamp()
  for update;

  if not found
    or p_lease_expires_at <= p_heartbeat_at
    or p_lease_expires_at <= clock_timestamp()
  then
    return jsonb_build_object('outcome', 'lost_lease');
  end if;

  if p_usage_event_id is not null then
    if p_usage_phase not in ('primary', 'replacement')
      or p_input_tokens < 0
      or p_cached_input_tokens < 0
      or p_cache_write_tokens < 0
      or p_output_tokens < 0
      or p_search_count < 0
      or p_estimated_cost_microdollars < 0
      or p_cached_input_tokens + p_cache_write_tokens > p_input_tokens
      or v_run.input_tokens > 2147483647 - p_input_tokens
      or v_run.cached_input_tokens > 2147483647 - p_cached_input_tokens
      or v_run.cache_write_tokens > 2147483647 - p_cache_write_tokens
      or v_run.output_tokens > 2147483647 - p_output_tokens
      or v_run.search_count > 2147483647 - p_search_count
      or v_run.estimated_cost_microdollars > 999999999999 - p_estimated_cost_microdollars
    then
      return jsonb_build_object('outcome', 'invalid_usage');
    end if;

    insert into public.daily_question_review_usage_events (
      id, run_id, slot, phase, input_tokens, cached_input_tokens,
      cache_write_tokens, output_tokens, search_count,
      estimated_cost_microdollars
    ) values (
      p_usage_event_id, p_run_id, p_slot, p_usage_phase, p_input_tokens,
      p_cached_input_tokens, p_cache_write_tokens, p_output_tokens,
      p_search_count, p_estimated_cost_microdollars
    )
    on conflict (id) do nothing;
    get diagnostics v_inserted = row_count;
    v_usage_applied := v_inserted = 1;
  end if;

  update public.daily_question_review_runs
  set input_tokens = input_tokens + case when v_usage_applied then p_input_tokens else 0 end,
      cached_input_tokens = cached_input_tokens + case when v_usage_applied then p_cached_input_tokens else 0 end,
      cache_write_tokens = cache_write_tokens + case when v_usage_applied then p_cache_write_tokens else 0 end,
      output_tokens = output_tokens + case when v_usage_applied then p_output_tokens else 0 end,
      search_count = search_count + case when v_usage_applied then p_search_count else 0 end,
      estimated_cost_microdollars = estimated_cost_microdollars + case when v_usage_applied then p_estimated_cost_microdollars else 0 end,
      estimated_cost_usd = (estimated_cost_microdollars + case when v_usage_applied then p_estimated_cost_microdollars else 0 end)::numeric / 1000000,
      heartbeat_at = p_heartbeat_at,
      lease_expires_at = p_lease_expires_at
  where id = p_run_id
  returning * into v_run;

  insert into public.daily_question_review_items (
    run_id, daily_challenge_id, slot, question_id, question_snapshot,
    review_status, verdict, confidence, explanation, conflicts,
    source_fetch_results, evidence, verified_at, replacement_question_id,
    replacement_eligible, replacement_question_snapshot, replacement_finding
  ) values (
    p_run_id, p_daily_challenge_id, p_slot, p_question_id,
    p_question_snapshot, p_review_status, p_verdict, p_confidence,
    p_explanation, p_conflicts, p_source_fetch_results, p_evidence,
    p_verified_at, p_replacement_question_id, p_replacement_eligible,
    p_replacement_question_snapshot, p_replacement_finding
  )
  on conflict (run_id, slot) do update set
    question_id = excluded.question_id,
    question_snapshot = excluded.question_snapshot,
    review_status = excluded.review_status,
    verdict = excluded.verdict,
    confidence = excluded.confidence,
    explanation = excluded.explanation,
    conflicts = excluded.conflicts,
    source_fetch_results = excluded.source_fetch_results,
    evidence = excluded.evidence,
    verified_at = excluded.verified_at,
    replacement_question_id = excluded.replacement_question_id,
    replacement_eligible = excluded.replacement_eligible,
    replacement_question_snapshot = excluded.replacement_question_snapshot,
    replacement_finding = excluded.replacement_finding
  returning * into v_item;

  return jsonb_build_object(
    'outcome', 'persisted',
    'usage_applied', v_usage_applied,
    'item', to_jsonb(v_item),
    'run', to_jsonb(v_run)
  );
end;
$function$;

revoke all on function public.persist_daily_question_review_progress(uuid, uuid, timestamptz, timestamptz, uuid, smallint, uuid, jsonb, text, jsonb, text, numeric, text, jsonb, jsonb, timestamptz, uuid, boolean, jsonb, jsonb, uuid, text, integer, integer, integer, integer, integer, bigint) from public, anon, authenticated;

grant execute on function public.persist_daily_question_review_progress(uuid, uuid, timestamptz, timestamptz, uuid, smallint, uuid, jsonb, text, jsonb, text, numeric, text, jsonb, jsonb, timestamptz, uuid, boolean, jsonb, jsonb, uuid, text, integer, integer, integer, integer, integer, bigint) to service_role;

create or replace function public.finalize_daily_question_review_run(
  p_run_id uuid,
  p_claim_token uuid,
  p_reservation_id uuid,
  p_status text,
  p_completed_at timestamptz,
  p_errors jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_run public.daily_question_review_runs%rowtype;
  v_reservation public.daily_question_review_reservations%rowtype;
  v_reservation_actual_microdollars bigint;
begin
  select r.* into v_run
  from public.daily_question_review_runs r
  where r.id = p_run_id
    and r.status = 'running'
    and r.claim_token = p_claim_token
    and r.lease_expires_at > p_completed_at
    and r.lease_expires_at > clock_timestamp()
  for update;

  if not found
    or p_status not in ('completed', 'completed_with_flags', 'failed')
  then
    return jsonb_build_object('outcome', 'lost_lease');
  end if;

  select r.* into v_reservation
  from public.daily_question_review_reservations r
  where r.id = p_reservation_id
  for update;

  v_reservation_actual_microdollars :=
    v_run.estimated_cost_microdollars - v_reservation.run_cost_baseline_microdollars;

  if not found
    or v_reservation.status <> 'active'
    or not (
      v_reservation_actual_microdollars between 0 and v_reservation.reserved_microdollars
    )
  then
    return jsonb_build_object('outcome', 'reservation_conflict');
  end if;

  update public.daily_question_review_runs
  set status = p_status,
      completed_at = p_completed_at,
      errors = p_errors
  where id = p_run_id
  returning * into v_run;

  update public.daily_question_review_reservations
  set actual_microdollars = v_reservation_actual_microdollars,
      status = case when v_reservation_actual_microdollars = 0 then 'released' else 'reconciled' end,
      reconciled_at = p_completed_at
  where id = p_reservation_id;

  return jsonb_build_object(
    'outcome', 'completed',
    'actual_microdollars', v_reservation_actual_microdollars,
    'run', to_jsonb(v_run)
  );
end;
$function$;

revoke all on function public.finalize_daily_question_review_run(uuid, uuid, uuid, text, timestamptz, jsonb) from public, anon, authenticated;

grant execute on function public.finalize_daily_question_review_run(uuid, uuid, uuid, text, timestamptz, jsonb) to service_role;

create or replace function public.acquire_daily_question_review_reservation(
  p_review_date date,
  p_challenge_date date,
  p_model text,
  p_model_derived_reservation_microdollars bigint,
  p_required_reservation_microdollars bigint,
  p_month_start timestamptz,
  p_month_end timestamptz,
  p_limit_microdollars bigint,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_existing public.daily_question_review_reservations%rowtype;
  v_reservation_id uuid;
  v_committed_microdollars bigint;
  v_run_cost_baseline_microdollars bigint;
  v_denial_created boolean := false;
begin
  if p_review_date is null
    or p_challenge_date is null
    or p_review_date >= p_challenge_date
    or p_model is null
    or char_length(btrim(p_model)) not between 1 and 100
    or p_model_derived_reservation_microdollars is null
    or not (
      btrim(p_model) = 'gpt-5.6-terra'
      and p_model_derived_reservation_microdollars = 5040000
    )
    or p_required_reservation_microdollars is null
    or p_required_reservation_microdollars <= 0
    or not (
      p_required_reservation_microdollars = p_model_derived_reservation_microdollars
    )
    or p_required_reservation_microdollars > 9007199254740991
    or p_month_start is null
    or p_month_end is null
    or p_month_start >= p_month_end
    or p_limit_microdollars is null
    or p_limit_microdollars <= 0
    or p_limit_microdollars > 9007199254740991
    or p_now is null
    or p_now < p_month_start
    or p_now >= p_month_end
  then
    return jsonb_build_object('acquired', false, 'reason', 'invalid_request');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_month_start::text || '/' || p_month_end::text, 0)
  );

  select r.*
  into v_existing
  from public.daily_question_review_reservations r
  where r.challenge_date = p_challenge_date
    and r.run_kind = 'scheduled'
    and r.status = 'active'
  for update;

  if found then
    if v_existing.model <> btrim(p_model)
      or v_existing.reserved_microdollars <> p_required_reservation_microdollars
      or v_existing.month_start <> p_month_start
      or v_existing.month_end <> p_month_end
    then
      return jsonb_build_object('acquired', false, 'reason', 'active_conflict');
    end if;

    return jsonb_build_object(
      'acquired', true,
      'created', false,
      'reservation_id', v_existing.id,
      'reserved_microdollars', v_existing.reserved_microdollars
    );
  end if;

  select coalesce(sum(
    case when status = 'active' then reserved_microdollars else actual_microdollars end
  ), 0)::bigint
  into v_committed_microdollars
  from public.daily_question_review_reservations
  where acquired_at >= p_month_start
    and acquired_at < p_month_end
    and status in ('active', 'reconciled', 'released');

  if v_committed_microdollars + p_required_reservation_microdollars > p_limit_microdollars
  then
    insert into public.daily_question_review_reservations (
      review_date,
      challenge_date,
      model,
      status,
      reserved_microdollars,
      actual_microdollars,
      month_start,
      month_end,
      acquired_at,
      reconciled_at,
      denial_reason
    ) values (
      p_review_date,
      p_challenge_date,
      btrim(p_model),
      'denied',
      p_required_reservation_microdollars,
      0,
      p_month_start,
      p_month_end,
      p_now,
      p_now,
      'monthly_budget_exceeded'
    )
    on conflict (challenge_date, run_kind)
      where status = 'denied'
    do nothing
    returning true into v_denial_created;

    v_denial_created := coalesce(v_denial_created, false);

    return jsonb_build_object(
      'acquired', false,
      'reason', 'monthly_budget_exceeded',
      'denial_created', v_denial_created,
      'committed_microdollars', v_committed_microdollars
    );
  end if;

  select coalesce(max(r.estimated_cost_microdollars), 0)::bigint
  into v_run_cost_baseline_microdollars
  from public.daily_question_review_runs r
  where r.challenge_date = p_challenge_date
    and r.run_kind = 'scheduled';

  insert into public.daily_question_review_reservations (
    review_date,
    challenge_date,
    model,
    status,
    reserved_microdollars,
    run_cost_baseline_microdollars,
    actual_microdollars,
    month_start,
    month_end,
    acquired_at
  ) values (
    p_review_date,
    p_challenge_date,
    btrim(p_model),
    'active',
    p_required_reservation_microdollars,
    v_run_cost_baseline_microdollars,
    0,
    p_month_start,
    p_month_end,
    p_now
  )
  returning id into v_reservation_id;

  return jsonb_build_object(
    'acquired', true,
    'created', true,
    'reservation_id', v_reservation_id,
    'reserved_microdollars', p_required_reservation_microdollars
  );
end;
$function$;

revoke all on function public.acquire_daily_question_review_reservation(date, date, text, bigint, bigint, timestamptz, timestamptz, bigint, timestamptz) from public, anon, authenticated;

grant execute on function public.acquire_daily_question_review_reservation(date, date, text, bigint, bigint, timestamptz, timestamptz, bigint, timestamptz) to service_role;

comment on function public.acquire_daily_question_review_reservation(date, date, text, bigint, bigint, timestamptz, timestamptz, bigint, timestamptz) is
  'Service-role-only atomic monthly budget reservation for nightly question verification.';

create or replace function public.reconcile_daily_question_review_reservation(
  p_reservation_id uuid,
  p_actual_microdollars bigint,
  p_reconciled_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_reservation public.daily_question_review_reservations%rowtype;
begin
  if p_reservation_id is null
    or p_actual_microdollars is null
    or p_actual_microdollars < 0
    or p_actual_microdollars > 9007199254740991
    or p_reconciled_at is null
  then
    return jsonb_build_object('outcome', 'invalid', 'actual_microdollars', 0);
  end if;

  select month_start, month_end
  into v_month_start, v_month_end
  from public.daily_question_review_reservations
  where id = p_reservation_id;

  if not found then
    return jsonb_build_object('outcome', 'missing', 'actual_microdollars', 0);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_month_start::text || '/' || v_month_end::text, 0)
  );

  select r.*
  into v_reservation
  from public.daily_question_review_reservations r
  where r.id = p_reservation_id
  for update;

  if v_reservation.status in ('reconciled', 'released') then
    return jsonb_build_object(
      'outcome',
      case when v_reservation.actual_microdollars = 0 then 'released' else 'reconciled' end,
      'actual_microdollars',
      v_reservation.actual_microdollars
    );
  end if;

  if v_reservation.status <> 'active'
    or not (p_actual_microdollars <= v_reservation.reserved_microdollars)
  then
    return jsonb_build_object('outcome', 'conflict', 'actual_microdollars', 0);
  end if;

  update public.daily_question_review_reservations
  set actual_microdollars = p_actual_microdollars,
      status = case when p_actual_microdollars = 0 then 'released' else 'reconciled' end,
      reconciled_at = p_reconciled_at
  where id = p_reservation_id;

  return jsonb_build_object(
    'outcome',
    case when p_actual_microdollars = 0 then 'released' else 'reconciled' end,
    'actual_microdollars',
    p_actual_microdollars
  );
end;
$function$;

revoke all on function public.reconcile_daily_question_review_reservation(uuid, bigint, timestamptz) from public, anon, authenticated;

grant execute on function public.reconcile_daily_question_review_reservation(uuid, bigint, timestamptz) to service_role;

comment on function public.reconcile_daily_question_review_reservation(uuid, bigint, timestamptz) is
  'Service-role-only reconciliation of reserved verification budget to API-reported actual spend.';

create or replace function public.claim_daily_question_review_run(
  p_review_date date,
  p_challenge_date date,
  p_claimed_at timestamptz,
  p_lease_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_run public.daily_question_review_runs%rowtype;
begin
  if p_review_date is null
    or p_challenge_date is null
    or p_review_date >= p_challenge_date
    or p_claimed_at is null
    or p_lease_expires_at is null
    or p_lease_expires_at <= p_claimed_at
    or p_lease_expires_at <= clock_timestamp()
  then
    return jsonb_build_object('outcome', 'invalid', 'run_id', null, 'claim_token', null);
  end if;

  select r.*
  into v_run
  from public.daily_question_review_runs r
  where r.run_kind = 'scheduled'
    and (
      r.challenge_date = p_challenge_date
      or r.review_date = p_review_date
    )
  order by case when r.challenge_date = p_challenge_date then 0 else 1 end
  limit 1
  for update;

  if not found then
    return jsonb_build_object('outcome', 'missing', 'run_id', null, 'claim_token', null);
  end if;

  if v_run.status = 'failed'
    or (
      v_run.status = 'running'
      and v_run.lease_expires_at <= clock_timestamp()
    )
  then
    update public.daily_question_review_runs
    set status = 'running',
        completed_at = null,
        claim_token = gen_random_uuid(),
        heartbeat_at = p_claimed_at,
        lease_expires_at = p_lease_expires_at
    where id = v_run.id
    returning * into v_run;

    return jsonb_build_object(
      'outcome', 'claimed',
      'run_id', v_run.id,
      'claim_token', v_run.claim_token
    );
  end if;

  return jsonb_build_object(
    'outcome', 'observed',
    'run_id', v_run.id,
    'claim_token', null
  );
end;
$function$;

revoke all on function public.claim_daily_question_review_run(date, date, timestamptz, timestamptz) from public, anon, authenticated;

grant execute on function public.claim_daily_question_review_run(date, date, timestamptz, timestamptz) to service_role;

comment on function public.claim_daily_question_review_run(date, date, timestamptz, timestamptz) is
  'Service-role-only atomic lease claim or stale-run reclaim for nightly verification.';

create or replace function public.heartbeat_daily_question_review_run(
  p_run_id uuid,
  p_claim_token uuid,
  p_heartbeat_at timestamptz,
  p_lease_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if p_run_id is null
    or p_claim_token is null
    or p_heartbeat_at is null
    or p_lease_expires_at is null
    or p_lease_expires_at <= p_heartbeat_at
    or p_lease_expires_at <= clock_timestamp()
  then
    return jsonb_build_object('renewed', false);
  end if;

  update public.daily_question_review_runs
  set heartbeat_at = p_heartbeat_at,
      lease_expires_at = p_lease_expires_at
  where id = p_run_id
    and status = 'running'
    and claim_token = p_claim_token
    and lease_expires_at > p_heartbeat_at
    and lease_expires_at > clock_timestamp();

  return jsonb_build_object('renewed', found);
end;
$function$;

revoke all on function public.heartbeat_daily_question_review_run(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;

grant execute on function public.heartbeat_daily_question_review_run(uuid, uuid, timestamptz, timestamptz) to service_role;

comment on function public.heartbeat_daily_question_review_run(uuid, uuid, timestamptz, timestamptz) is
  'Service-role-only token-fenced lease renewal for a running nightly verification.';

create or replace function public.claim_daily_question_review_email(
  p_run_id uuid,
  p_attempted_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_attempts integer;
begin
  if p_run_id is null or p_attempted_at is null then
    return jsonb_build_object('claimed', false, 'attempts', 0);
  end if;

  update public.daily_question_review_runs
  set email_status = 'sending',
      email_metadata = jsonb_build_object(
        'provider', 'resend',
        'providerMessageId', null,
        'attempts', (email_metadata->>'attempts')::integer + 1,
        'lastAttemptAt', p_attempted_at,
        'failure', null
      )
  where id = p_run_id
    and (
      email_status in ('pending', 'failed')
      or (
        email_status = 'sending'
        and updated_at <= p_attempted_at - interval '15 minutes'
      )
    )
    and (email_metadata->>'attempts')::integer < 10
  returning (email_metadata->>'attempts')::integer into v_attempts;

  if not found then
    select (email_metadata->>'attempts')::integer
    into v_attempts
    from public.daily_question_review_runs
    where id = p_run_id;

    return jsonb_build_object(
      'claimed', false,
      'attempts', coalesce(v_attempts, 0)
    );
  end if;

  return jsonb_build_object('claimed', true, 'attempts', v_attempts);
end;
$function$;

revoke all on function public.claim_daily_question_review_email(uuid, timestamptz) from public, anon, authenticated;

grant execute on function public.claim_daily_question_review_email(uuid, timestamptz) to service_role;

comment on function public.claim_daily_question_review_email(uuid, timestamptz) is
  'Service-role-only atomic claim for one nightly review email attempt.';

drop trigger if exists daily_question_review_runs_set_updated_at
  on public.daily_question_review_runs;
create trigger daily_question_review_runs_set_updated_at
before update on public.daily_question_review_runs
for each row
execute function public.set_updated_at();

drop trigger if exists daily_question_review_items_set_updated_at
  on public.daily_question_review_items;
create trigger daily_question_review_items_set_updated_at
before update on public.daily_question_review_items
for each row
execute function public.set_updated_at();

drop trigger if exists daily_question_review_reservations_set_updated_at
  on public.daily_question_review_reservations;
create trigger daily_question_review_reservations_set_updated_at
before update on public.daily_question_review_reservations
for each row
execute function public.set_updated_at();

create index if not exists daily_question_review_runs_status_review_date_idx
  on public.daily_question_review_runs (status, review_date desc);

create index if not exists daily_question_review_runs_challenge_id_idx
  on public.daily_question_review_runs (daily_challenge_id);

create index if not exists daily_question_review_items_run_verdict_idx
  on public.daily_question_review_items (run_id, verdict);

create index if not exists daily_question_review_items_run_status_idx
  on public.daily_question_review_items (run_id, review_status);

create index if not exists daily_question_review_items_resolution_idx
  on public.daily_question_review_items (resolution, created_at desc);

create index if not exists daily_question_review_items_question_id_idx
  on public.daily_question_review_items (question_id);

create unique index if not exists daily_question_review_reservations_active_challenge_unique
  on public.daily_question_review_reservations (challenge_date, run_kind)
  where status = 'active';

create unique index if not exists daily_question_review_reservations_denied_challenge_unique
  on public.daily_question_review_reservations (challenge_date, run_kind)
  where status = 'denied';

create index if not exists daily_question_review_reservations_month_status_idx
  on public.daily_question_review_reservations (month_start, month_end, status, acquired_at);

alter table public.daily_question_review_runs enable row level security;
alter table public.daily_question_review_items enable row level security;
alter table public.daily_question_review_reservations enable row level security;
alter table public.daily_question_review_usage_events enable row level security;

revoke all on public.daily_question_review_runs from public, anon, authenticated;
revoke all on public.daily_question_review_items from public, anon, authenticated;
revoke all on public.daily_question_review_reservations from public, anon, authenticated;
revoke all on public.daily_question_review_usage_events from public, anon, authenticated;

grant select, insert, update on public.daily_question_review_runs to service_role;
grant select, insert, update on public.daily_question_review_items to service_role;
grant select, insert, update on public.daily_question_review_reservations to service_role;
grant select on public.daily_question_review_usage_events to service_role;

comment on table public.daily_question_review_runs is
  'Service-role-only operational record for each nightly Daily 5 verification run.';

comment on table public.daily_question_review_items is
  'Service-role-only verification findings and administrator resolutions for a nightly Daily 5 review.';

comment on table public.daily_question_review_reservations is
  'Service-role-only atomic budget reservation ledger for nightly Daily 5 verification.';

create schema if not exists internal;

revoke all on schema internal from public, anon, authenticated;

create or replace view internal.daily_question_review
with (security_invoker = true)
as
select
  r.id as run_id,
  r.daily_challenge_id,
  r.review_date,
  r.challenge_date,
  r.status as run_status,
  r.run_kind,
  r.model,
  r.verifier_version,
  r.started_at,
  r.completed_at,
  r.input_tokens,
  r.cached_input_tokens,
  r.cache_write_tokens,
  r.output_tokens,
  r.search_count,
  r.estimated_cost_microdollars,
  r.estimated_cost_usd,
  r.email_status,
  r.email_sent_at,
  r.email_metadata,
  r.errors as run_errors,
  i.id as review_item_id,
  i.slot,
  i.question_id,
  i.question_snapshot->'sport'->>'slug' as sport,
  i.question_snapshot->'sport'->>'name' as sport_name,
  i.question_snapshot->>'difficulty' as difficulty,
  i.question_snapshot,
  i.review_status,
  i.verdict,
  i.confidence,
  i.explanation,
  i.conflicts,
  i.source_fetch_results,
  i.evidence,
  i.verified_at,
  i.replacement_question_id,
  i.replacement_eligible,
  i.replacement_question_snapshot,
  i.replacement_finding,
  i.resolution,
  i.resolved_by,
  i.resolved_at,
  i.application_metadata,
  i.applied_at,
  i.created_at as item_created_at,
  i.updated_at as item_updated_at
from public.daily_question_review_runs r
join public.daily_question_review_items i
  on i.run_id = r.id;

comment on view internal.daily_question_review is
  'Service-role-only owner review view for nightly Daily 5 verification findings and resolutions.';

revoke all on internal.daily_question_review from public, anon, authenticated;

grant usage on schema internal to service_role;
grant select on internal.daily_question_review to service_role;

create or replace function public.resolve_daily_question_review_item(
  p_review_item_id uuid,
  p_challenge_date date,
  p_action text,
  p_replacement_question_id uuid,
  p_resolved_by uuid,
  p_resolved_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_item public.daily_question_review_items%rowtype;
  v_run public.daily_question_review_runs%rowtype;
  v_challenge public.daily_challenges%rowtype;
  v_challenge_item public.daily_challenge_items%rowtype;
  v_question public.questions%rowtype;
  v_expected_resolution text;
begin
  if p_action not in ('keep', 'replace')
    or p_resolved_by is null
    or p_resolved_at is null
  then
    return jsonb_build_object('outcome', 'conflict');
  end if;

  select i.* into v_item
  from public.daily_question_review_items i
  where i.id = p_review_item_id
  for update;
  if not found then
    return jsonb_build_object('outcome', 'missing');
  end if;

  select r.* into v_run
  from public.daily_question_review_runs r
  where r.id = v_item.run_id
    and r.challenge_date = p_challenge_date
    and r.daily_challenge_id = v_item.daily_challenge_id
  for update;
  if not found then
    return jsonb_build_object('outcome', 'missing');
  end if;

  v_expected_resolution := case when p_action = 'keep' then 'kept' else 'replaced' end;
  if v_item.resolution <> 'pending' then
    if v_item.resolution = v_expected_resolution
      and (
        p_action = 'keep'
        or v_item.replacement_question_id = p_replacement_question_id
      )
    then
      return jsonb_build_object(
        'outcome', 'already_resolved',
        'resolution', v_item.resolution
      );
    end if;
    return jsonb_build_object('outcome', 'conflict');
  end if;

  if v_item.review_status <> 'completed'
    or v_item.verdict not in ('risk', 'unable_to_verify')
  then
    return jsonb_build_object('outcome', 'conflict');
  end if;

  select c.* into v_challenge
  from public.daily_challenges c
  where c.id = v_item.daily_challenge_id
    and c.challenge_date = p_challenge_date
  for update;
  if not found then
    return jsonb_build_object('outcome', 'missing');
  end if;
  if v_challenge.status <> 'generated' or v_challenge.published_at is not null then
    return jsonb_build_object('outcome', 'not_draft');
  end if;

  if p_action = 'keep' then
    if p_replacement_question_id is not null then
      return jsonb_build_object('outcome', 'conflict');
    end if;
    update public.daily_question_review_items
    set resolution = 'kept',
        resolved_by = p_resolved_by,
        resolved_at = p_resolved_at
    where id = v_item.id;
    return jsonb_build_object('outcome', 'resolved', 'resolution', 'kept');
  end if;

  if not v_item.replacement_eligible
    or v_item.replacement_question_id is null
    or v_item.replacement_question_id <> p_replacement_question_id
    or v_item.replacement_question_snapshot is null
    or v_item.replacement_finding->>'verdict' <> 'passed'
    or jsonb_array_length(v_item.replacement_finding->'evidence') = 0
  then
    return jsonb_build_object('outcome', 'conflict');
  end if;

  select q.* into v_question
  from public.questions q
  where q.id = p_replacement_question_id
    and q.status = 'ready'
    and q.eligible_for_daily is true
  for update;
  if not found then
    return jsonb_build_object('outcome', 'conflict');
  end if;

  select i.* into v_challenge_item
  from public.daily_challenge_items i
  where i.daily_challenge_id = v_item.daily_challenge_id
    and i.slot = v_item.slot
  for update;
  if not found or v_challenge_item.question_id <> v_item.question_id then
    return jsonb_build_object('outcome', 'conflict');
  end if;
  if v_item.replacement_question_snapshot->>'difficulty'
      <> v_item.question_snapshot->>'difficulty'
    or exists (
      select 1
      from public.daily_challenge_items other
      where other.daily_challenge_id = v_item.daily_challenge_id
        and other.slot <> v_item.slot
        and other.question_id = p_replacement_question_id
    )
  then
    return jsonb_build_object('outcome', 'conflict');
  end if;

  update public.daily_challenge_items
  set question_id = p_replacement_question_id,
      question_snapshot = v_item.replacement_question_snapshot
  where id = v_challenge_item.id;

  update public.daily_question_review_items
  set resolution = 'replaced',
      resolved_by = p_resolved_by,
      resolved_at = p_resolved_at,
      applied_at = p_resolved_at,
      application_metadata = jsonb_build_object(
        'previousQuestionId', v_item.question_id,
        'replacementQuestionId', p_replacement_question_id
      )
  where id = v_item.id;

  return jsonb_build_object('outcome', 'resolved', 'resolution', 'replaced');
end;
$function$;

revoke all on function public.resolve_daily_question_review_item(uuid, date, text, uuid, uuid, timestamptz) from public, anon, authenticated;

grant execute on function public.resolve_daily_question_review_item(uuid, date, text, uuid, uuid, timestamptz) to service_role;
