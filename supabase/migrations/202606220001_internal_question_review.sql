create schema if not exists internal;

revoke all on schema internal from public, anon, authenticated;

create or replace view internal.question_review
with (security_invoker = true)
as
select
  q.id as question_id,
  s.slug as sport,
  s.name as sport_name,
  s.sort_order as sport_sort_order,
  q.difficulty,
  q.status,
  q.eligible_for_daily,
  q.eligible_for_sport_quiz,
  q.question_text,
  q.option_a,
  q.option_b,
  q.option_c,
  q.option_d,
  q.correct_option,
  case q.correct_option
    when 'A' then q.option_a
    when 'B' then q.option_b
    when 'C' then q.option_c
    when 'D' then q.option_d
  end as correct_answer,
  q.authoring_method,
  q.source_notes,
  q.reviewed_at,
  q.created_at,
  q.updated_at
from public.questions q
join public.sports s
  on s.id = q.sport_id;

comment on schema internal is
  'Private administrative schema for dashboard-only review helpers.';

comment on view internal.question_review is
  'Dashboard-only question bank review view. Do not grant to anon or authenticated.';

revoke all on internal.question_review from public, anon, authenticated;
