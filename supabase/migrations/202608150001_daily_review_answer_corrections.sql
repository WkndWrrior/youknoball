create or replace function public.correct_daily_question_review_answer(
  p_review_item_id uuid,
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
  v_run public.daily_question_review_runs%rowtype;
  v_challenge public.daily_challenges%rowtype;
  v_question public.questions%rowtype;
  v_challenge_item public.daily_challenge_items%rowtype;
  v_old_correct_option text;
begin
  if p_challenge_date is null
    or p_new_correct_option is null
    or p_new_correct_option not in ('A', 'B', 'C', 'D')
    or p_finding_question_id is null
    or p_finding_verdict is null
    or p_finding_verdict <> 'passed'
    or p_finding_confidence is null
    or not (p_finding_confidence between 0 and 1)
    or p_finding_explanation is null
    or not (char_length(btrim(p_finding_explanation)) between 1 and 2000)
    or case
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
    or case
      when jsonb_typeof(p_finding_evidence) = 'array' then
        not (jsonb_array_length(p_finding_evidence) between 1 and 10)
        or exists (
          select 1
          from jsonb_array_elements(p_finding_evidence) as evidence(value)
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
        )
      else true
    end
    or p_finding_verified_at is null
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
  for update;
  if not found then
    return jsonb_build_object('outcome', 'missing');
  end if;
  if v_run.challenge_date <> p_challenge_date
    or v_run.daily_challenge_id <> v_item.daily_challenge_id
  then
    return jsonb_build_object('outcome', 'conflict');
  end if;

  if v_item.review_status <> 'completed'
    or v_item.resolution <> 'pending'
    or v_item.verdict not in ('risk', 'unable_to_verify')
    or p_finding_question_id <> v_item.question_id
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
    or v_question.correct_option <> v_old_correct_option
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
      application_metadata = jsonb_build_object(
        'action', 'correct_answer',
        'previousCorrectOption', v_old_correct_option,
        'newCorrectOption', p_new_correct_option
      )
  where id = v_item.id;

  return jsonb_build_object('outcome', 'corrected');
end;
$function$;

revoke all on function public.correct_daily_question_review_answer(uuid, date, text, uuid, text, numeric, text, jsonb, jsonb, timestamptz, uuid, timestamptz) from public, anon, authenticated;

grant execute on function public.correct_daily_question_review_answer(uuid, date, text, uuid, text, numeric, text, jsonb, jsonb, timestamptz, uuid, timestamptz) to service_role;
