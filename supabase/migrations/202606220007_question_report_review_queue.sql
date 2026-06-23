create schema if not exists internal;

revoke all on schema internal from public, anon, authenticated;

create or replace view internal.question_report_review
with (security_invoker = true)
as
select
  r.id as report_id,
  r.status as report_status,
  r.reason as report_reason,
  r.note as report_note,
  r.context as report_context,
  r.created_at as reported_at,
  r.reviewed_at,
  r.reviewer_notes,
  r.reporter_user_id,
  p.display_name as reporter_display_name,
  q.id as question_id,
  s.slug as sport,
  s.name as sport_name,
  s.sort_order as sport_sort_order,
  q.difficulty,
  q.status as question_status,
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
  q.source_notes,
  q.reviewed_at as question_reviewed_at,
  q.updated_at as question_updated_at
from public.question_reports r
join public.questions q
  on q.id = r.question_id
join public.sports s
  on s.id = q.sport_id
left join public.profiles p
  on p.id = r.reporter_user_id;

comment on view internal.question_report_review is
  'Private review queue for player-reported question issues. Query from Supabase dashboard only.';

revoke all on internal.question_report_review from public, anon, authenticated;
