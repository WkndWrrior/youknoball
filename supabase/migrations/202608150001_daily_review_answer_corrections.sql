alter table public.daily_question_review_items
  add column answer_correction_claim_token uuid,
  add column answer_correction_claimed_by uuid,
  add column answer_correction_claimed_option text,
  add column answer_correction_claim_expires_at timestamptz,
  add constraint daily_question_review_items_answer_correction_claim_check
    check (
      (
        answer_correction_claim_token is null
        and answer_correction_claimed_by is null
        and answer_correction_claimed_option is null
        and answer_correction_claim_expires_at is null
      )
      or (
        answer_correction_claim_token is not null
        and answer_correction_claimed_by is not null
        and answer_correction_claimed_option in ('A', 'B', 'C', 'D')
        and answer_correction_claim_expires_at is not null
      )
    );

do $migration$
declare
  v_resolution_constraint_names text[];
begin
  select pg_catalog.array_agg(c.conname order by c.conname)
  into v_resolution_constraint_names
  from pg_catalog.pg_constraint c
  join pg_catalog.pg_class t
    on t.oid = c.conrelid
  join pg_catalog.pg_namespace n
    on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'daily_question_review_items'
    and c.contype = 'c'
    and position('resolution' in pg_catalog.pg_get_constraintdef(c.oid)) > 0
    and position('resolved_by' in pg_catalog.pg_get_constraintdef(c.oid)) > 0
    and position('resolved_at' in pg_catalog.pg_get_constraintdef(c.oid)) > 0
    and position('applied_at' in pg_catalog.pg_get_constraintdef(c.oid)) > 0
    and position('application_metadata' in pg_catalog.pg_get_constraintdef(c.oid)) > 0;

  if coalesce(cardinality(v_resolution_constraint_names), 0) <> 1 then
    raise exception 'Expected exactly one existing daily question review resolution-state check constraint.';
  end if;

  execute pg_catalog.format(
    'alter table public.daily_question_review_items drop constraint %I',
    v_resolution_constraint_names[1]
  );
end;
$migration$;

alter table public.daily_question_review_items
  add constraint daily_question_review_items_resolution_state_check
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
      and resolved_at >= created_at
      and (
        application_metadata = '{}'::jsonb
        or (
          jsonb_typeof(application_metadata) = 'object'
          and application_metadata ?& array[
            'action',
            'previousCorrectOption',
            'newCorrectOption'
          ]
          and application_metadata - array['action', 'previousCorrectOption', 'newCorrectOption'] = '{}'::jsonb
          and jsonb_typeof(application_metadata->'action') = 'string'
          and application_metadata->>'action' = 'correct_answer'
          and verdict = 'passed'
          and jsonb_array_length(evidence) > 0
          and jsonb_typeof(application_metadata->'previousCorrectOption') = 'string'
          and application_metadata->>'previousCorrectOption' in ('A', 'B', 'C', 'D')
          and jsonb_typeof(application_metadata->'newCorrectOption') = 'string'
          and application_metadata->>'newCorrectOption' in ('A', 'B', 'C', 'D')
          and application_metadata->>'previousCorrectOption'
            <> application_metadata->>'newCorrectOption'
          and question_snapshot->>'correct_option'
            = application_metadata->>'newCorrectOption'
        )
      )
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
  );

create or replace function public.claim_daily_question_review_answer_correction(
  p_review_item_id uuid,
  p_challenge_date date,
  p_new_correct_option text,
  p_claim_token uuid,
  p_claimed_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_item public.daily_question_review_items%rowtype;
  v_precheck_run public.daily_question_review_runs%rowtype;
  v_run public.daily_question_review_runs%rowtype;
  v_challenge public.daily_challenges%rowtype;
  v_initial_run_id uuid;
  v_old_correct_option text;
  v_claim_expires_at timestamptz;
begin
  if p_review_item_id is null
    or p_challenge_date is null
    or p_new_correct_option is null
    or p_new_correct_option not in ('A', 'B', 'C', 'D')
    or p_claim_token is null
    or p_claimed_by is null
  then
    return jsonb_build_object('outcome', 'conflict');
  end if;

  select i.run_id into v_initial_run_id
  from public.daily_question_review_items i
  where i.id = p_review_item_id;
  if not found then
    return jsonb_build_object('outcome', 'missing');
  end if;

  select r.* into v_precheck_run
  from public.daily_question_review_runs r
  where r.id = v_initial_run_id;
  if not found then
    return jsonb_build_object('outcome', 'missing');
  end if;
  if v_precheck_run.status not in ('completed', 'completed_with_flags')
    or v_precheck_run.completed_at is null
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
  if v_item.run_id <> v_initial_run_id then
    return jsonb_build_object('outcome', 'conflict');
  end if;

  select r.* into v_run
  from public.daily_question_review_runs r
  where r.id = v_item.run_id
  for update;
  if not found then
    return jsonb_build_object('outcome', 'missing');
  end if;
  if v_run.challenge_date <> p_challenge_date
    or v_run.daily_challenge_id <> v_item.daily_challenge_id
    or v_run.status not in ('completed', 'completed_with_flags')
    or v_run.completed_at is null
  then
    return jsonb_build_object('outcome', 'conflict');
  end if;

  if v_item.review_status <> 'completed'
    or v_item.resolution <> 'pending'
    or v_item.verdict not in ('risk', 'unable_to_verify')
  then
    return jsonb_build_object('outcome', 'conflict');
  end if;

  v_old_correct_option := v_item.question_snapshot->>'correct_option';
  if (v_item.question_snapshot->>'id')::uuid <> v_item.question_id
    or v_old_correct_option not in ('A', 'B', 'C', 'D')
  then
    return jsonb_build_object('outcome', 'conflict');
  end if;
  if p_new_correct_option = v_old_correct_option then
    return jsonb_build_object('outcome', 'unchanged');
  end if;

  select c.* into v_challenge
  from public.daily_challenges c
  where c.id = v_item.daily_challenge_id
  for update;
  if not found then
    return jsonb_build_object('outcome', 'missing');
  end if;
  if v_challenge.challenge_date <> p_challenge_date then
    return jsonb_build_object('outcome', 'conflict');
  end if;
  if v_challenge.status <> 'generated' or v_challenge.published_at is not null then
    return jsonb_build_object('outcome', 'not_draft');
  end if;

  if v_item.answer_correction_claim_token is not null
    and v_item.answer_correction_claim_expires_at > clock_timestamp()
  then
    return jsonb_build_object('outcome', 'busy');
  end if;

  v_claim_expires_at := clock_timestamp() + interval '3 minutes';
  update public.daily_question_review_items
  set answer_correction_claim_token = p_claim_token,
      answer_correction_claimed_by = p_claimed_by,
      answer_correction_claimed_option = p_new_correct_option,
      answer_correction_claim_expires_at = v_claim_expires_at
  where id = v_item.id;

  return jsonb_build_object(
    'outcome', 'claimed',
    'claim_expires_at', v_claim_expires_at
  );
end;
$function$;

revoke all on function public.claim_daily_question_review_answer_correction(uuid, date, text, uuid, uuid) from public, anon, authenticated;

grant execute on function public.claim_daily_question_review_answer_correction(uuid, date, text, uuid, uuid) to service_role;

create or replace function public.release_daily_question_review_answer_correction(
  p_review_item_id uuid,
  p_claim_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if p_review_item_id is null or p_claim_token is null then
    return jsonb_build_object('outcome', 'not_owned');
  end if;

  update public.daily_question_review_items
  set answer_correction_claim_token = null,
      answer_correction_claimed_by = null,
      answer_correction_claimed_option = null,
      answer_correction_claim_expires_at = null
  where id = p_review_item_id
    and answer_correction_claim_token = p_claim_token;
  if found then
    return jsonb_build_object('outcome', 'released');
  end if;
  if exists (
    select 1
    from public.daily_question_review_items i
    where i.id = p_review_item_id
  ) then
    return jsonb_build_object('outcome', 'not_owned');
  end if;
  return jsonb_build_object('outcome', 'missing');
end;
$function$;

revoke all on function public.release_daily_question_review_answer_correction(uuid, uuid) from public, anon, authenticated;

grant execute on function public.release_daily_question_review_answer_correction(uuid, uuid) to service_role;

create or replace function public.correct_daily_question_review_answer(
  p_review_item_id uuid,
  p_claim_token uuid,
  p_challenge_date date,
  p_new_correct_option text,
  p_finding_question_id uuid,
  p_finding_verdict text,
  p_finding_confidence numeric,
  p_finding_explanation text,
  p_finding_conflicts jsonb,
  p_finding_evidence jsonb,
  p_finding_verified_at timestamptz,
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
  v_precheck_run public.daily_question_review_runs%rowtype;
  v_run public.daily_question_review_runs%rowtype;
  v_challenge public.daily_challenges%rowtype;
  v_question public.questions%rowtype;
  v_sport public.sports%rowtype;
  v_challenge_item public.daily_challenge_items%rowtype;
  v_initial_run_id uuid;
  v_old_correct_option text;
begin
  if p_claim_token is null
    or p_challenge_date is null
    or p_new_correct_option is null
    or p_new_correct_option not in ('A', 'B', 'C', 'D')
    or p_finding_question_id is null
    or p_finding_verdict is null
    or p_finding_verdict <> 'passed'
    or p_finding_confidence is null
    or not (p_finding_confidence between 0 and 1)
    or p_finding_explanation is null
    or not (char_length(btrim(p_finding_explanation)) between 1 and 2000)
    or (
      case
        when jsonb_typeof(p_finding_conflicts) = 'array' then
          jsonb_array_length(p_finding_conflicts) > 10
          or exists (
            select 1
            from jsonb_array_elements(p_finding_conflicts) as conflict(value)
            where jsonb_typeof(conflict.value) <> 'string'
              or not (char_length(btrim(conflict.value #>> '{}')) between 1 and 500)
          )
        else true
      end
    )
    or (
      case
        when jsonb_typeof(p_finding_evidence) = 'array' then
          not (jsonb_array_length(p_finding_evidence) between 1 and 10)
          or exists (
            select 1
            from jsonb_array_elements(p_finding_evidence) as evidence(value)
            cross join lateral (
              select lower(
                substring(evidence.value->>'url' from '^https://([^/?#]+)')
              ) as authority
            ) as evidence_authority
            where jsonb_typeof(evidence.value) <> 'object'
              or not (evidence.value ?& array['url', 'title', 'excerpt', 'retrievedAt'])
              or evidence.value - array['url', 'title', 'excerpt', 'retrievedAt'] <> '{}'::jsonb
              or jsonb_typeof(evidence.value->'url') <> 'string'
              or not (char_length(btrim(evidence.value->>'url')) between 1 and 2048)
              or evidence.value->>'url' !~ '^https://'
              or jsonb_typeof(evidence.value->'title') <> 'string'
              or not (char_length(btrim(evidence.value->>'title')) between 1 and 300)
              or jsonb_typeof(evidence.value->'excerpt') <> 'string'
              or not (char_length(btrim(evidence.value->>'excerpt')) between 1 and 1500)
              or jsonb_typeof(evidence.value->'retrievedAt') <> 'string'
              or not (char_length(btrim(evidence.value->>'retrievedAt')) between 1 and 50)
              or evidence_authority.authority is null
              or evidence_authority.authority
                !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?([.][a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
              or not exists (
                select 1
                from (values
                  ('baseball-reference.com'),
                  ('baseballhall.org'),
                  ('basketball-reference.com'),
                  ('espn.com'),
                  ('goduke.com'),
                  ('heisman.com'),
                  ('hhof.com'),
                  ('hockey-reference.com'),
                  ('lsusports.net'),
                  ('mlb.com'),
                  ('nba.com'),
                  ('ncaa.com'),
                  ('nfl.com'),
                  ('nhl.com'),
                  ('osubeavers.com'),
                  ('pro-football-reference.com'),
                  ('sabr.org'),
                  ('seahawks.com'),
                  ('sports-reference.com'),
                  ('uconnhuskies.com'),
                  ('uhcougars.com')
                ) as approved_source(domain)
                where evidence_authority.authority = approved_source.domain
                  or evidence_authority.authority like '%.' || approved_source.domain
              )
          )
        else true
      end
    )
    or p_finding_verified_at is null
    or p_resolved_by is null
    or p_resolved_at is null
  then
    return jsonb_build_object('outcome', 'conflict');
  end if;

  select i.run_id into v_initial_run_id
  from public.daily_question_review_items i
  where i.id = p_review_item_id;
  if not found then
    return jsonb_build_object('outcome', 'missing');
  end if;

  select r.* into v_precheck_run
  from public.daily_question_review_runs r
  where r.id = v_initial_run_id;
  if not found then
    return jsonb_build_object('outcome', 'missing');
  end if;
  if v_precheck_run.status not in ('completed', 'completed_with_flags')
    or v_precheck_run.completed_at is null
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
  if v_item.run_id <> v_initial_run_id then
    return jsonb_build_object('outcome', 'conflict');
  end if;

  select r.* into v_run
  from public.daily_question_review_runs r
  where r.id = v_item.run_id
  for update;
  if not found then
    return jsonb_build_object('outcome', 'missing');
  end if;

  if v_run.challenge_date <> p_challenge_date
    or v_run.daily_challenge_id <> v_item.daily_challenge_id
    or v_run.status not in ('completed', 'completed_with_flags')
    or v_run.completed_at is null
  then
    return jsonb_build_object('outcome', 'conflict');
  end if;

  if v_item.review_status <> 'completed'
    or v_item.resolution <> 'pending'
    or v_item.verdict not in ('risk', 'unable_to_verify')
    or p_finding_question_id <> v_item.question_id
    or v_item.answer_correction_claim_token is distinct from p_claim_token
    or v_item.answer_correction_claimed_option is distinct from p_new_correct_option
    or v_item.answer_correction_claimed_by is distinct from p_resolved_by
    or v_item.answer_correction_claim_expires_at is null
    or v_item.answer_correction_claim_expires_at <= clock_timestamp()
  then
    return jsonb_build_object('outcome', 'conflict');
  end if;

  v_old_correct_option := v_item.question_snapshot->>'correct_option';
  if (v_item.question_snapshot->>'id')::uuid <> v_item.question_id
    or v_old_correct_option not in ('A', 'B', 'C', 'D')
    or p_new_correct_option = v_old_correct_option
  then
    return jsonb_build_object('outcome', 'conflict');
  end if;

  select c.* into v_challenge
  from public.daily_challenges c
  where c.id = v_item.daily_challenge_id
  for update;
  if not found then
    return jsonb_build_object('outcome', 'missing');
  end if;
  if v_challenge.challenge_date <> p_challenge_date then
    return jsonb_build_object('outcome', 'conflict');
  end if;
  if v_challenge.status <> 'generated' or v_challenge.published_at is not null then
    return jsonb_build_object('outcome', 'not_draft');
  end if;

  select q.* into v_question
  from public.questions q
  where q.id = v_item.question_id
  for update;
  if not found then
    return jsonb_build_object('outcome', 'missing');
  end if;
  if v_question.id <> v_item.question_id
    or v_question.question_text is distinct from v_item.question_snapshot->>'question_text'
    or v_question.option_a is distinct from v_item.question_snapshot->>'option_a'
    or v_question.option_b is distinct from v_item.question_snapshot->>'option_b'
    or v_question.option_c is distinct from v_item.question_snapshot->>'option_c'
    or v_question.option_d is distinct from v_item.question_snapshot->>'option_d'
    or v_question.correct_option is distinct from v_old_correct_option
    or v_question.difficulty is distinct from v_item.question_snapshot->>'difficulty'
    or v_question.source_notes is distinct from v_item.question_snapshot->>'source_notes'
  then
    return jsonb_build_object('outcome', 'conflict');
  end if;

  select s.* into v_sport
  from public.sports s
  where s.id = v_question.sport_id;
  if not found then
    return jsonb_build_object('outcome', 'missing');
  end if;
  if v_sport.slug is distinct from v_item.question_snapshot->'sport'->>'slug'
    or v_sport.name is distinct from v_item.question_snapshot->'sport'->>'name'
  then
    return jsonb_build_object('outcome', 'conflict');
  end if;

  select i.* into v_challenge_item
  from public.daily_challenge_items i
  where i.daily_challenge_id = v_item.daily_challenge_id
    and i.slot = v_item.slot
  for update;
  if not found then
    return jsonb_build_object('outcome', 'missing');
  end if;
  if v_challenge_item.question_id <> v_item.question_id
    or v_challenge_item.question_snapshot <> v_item.question_snapshot
    or (v_challenge_item.question_snapshot->>'id')::uuid <> v_item.question_id
    or v_challenge_item.question_snapshot->>'correct_option' <> v_old_correct_option
  then
    return jsonb_build_object('outcome', 'conflict');
  end if;

  update public.questions
  set correct_option = p_new_correct_option
  where id = v_question.id;

  update public.daily_challenge_items
  set question_snapshot = jsonb_set(
    v_challenge_item.question_snapshot,
    '{correct_option}',
    to_jsonb(p_new_correct_option),
    false
  )
  where id = v_challenge_item.id;

  update public.daily_question_review_items
  set question_snapshot = jsonb_set(
        v_item.question_snapshot,
        '{correct_option}',
        to_jsonb(p_new_correct_option),
        false
      ),
      verdict = 'passed',
      confidence = p_finding_confidence,
      explanation = btrim(p_finding_explanation),
      conflicts = p_finding_conflicts,
      evidence = p_finding_evidence,
      verified_at = p_finding_verified_at,
      resolution = 'kept',
      resolved_by = p_resolved_by,
      resolved_at = p_resolved_at,
      answer_correction_claim_token = null,
      answer_correction_claimed_by = null,
      answer_correction_claimed_option = null,
      answer_correction_claim_expires_at = null,
      application_metadata = jsonb_build_object(
        'action', 'correct_answer',
        'previousCorrectOption', v_old_correct_option,
        'newCorrectOption', p_new_correct_option
      )
  where id = v_item.id;

  return jsonb_build_object('outcome', 'corrected');
end;
$function$;

revoke all on function public.correct_daily_question_review_answer(uuid, uuid, date, text, uuid, text, numeric, text, jsonb, jsonb, timestamptz, uuid, timestamptz) from public, anon, authenticated;

grant execute on function public.correct_daily_question_review_answer(uuid, uuid, date, text, uuid, text, numeric, text, jsonb, jsonb, timestamptz, uuid, timestamptz) to service_role;
