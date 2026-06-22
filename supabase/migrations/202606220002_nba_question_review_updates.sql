do $$
declare
  retired_count integer;
  updated_count integer;
begin
  update public.questions q
  set
    status = 'retired',
    eligible_for_daily = false,
    eligible_for_sport_quiz = false,
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'nba'
    and (
      q.id = any(array[
        '439c888e-70f3-430c-899d-f0ff7ea2c5bd',
        '86423599-bb32-4565-ae09-e5d270f9a878',
        'd6f10119-061f-4cc6-863b-7d284ba23120',
        '9eb5d587-572f-4e1b-b5fc-c5e60cb3df69',
        '1c0fddb8-3ee4-4457-aad1-2428ab0f4374',
        '2391a244-b432-42eb-acc2-4bc811c0887e',
        '8fd72930-a64b-437d-bea1-724e0268ffbb'
      ]::uuid[])
      or q.question_text = 'Stephen Curry has spent his NBA career with which franchise?'
    );

  get diagnostics retired_count = row_count;
  if retired_count <> 7 then
    raise exception 'Expected to retire 7 NBA questions, retired %', retired_count;
  end if;

  update public.questions q
  set
    question_text = 'In Game 5 of the 1989 Eastern Conference first round, which player hit the wonderful series-winning shot over Craig Ehlo?',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'nba'
    and q.id = '0905e82a-abcb-4861-84cc-8e3e0509d079'::uuid;

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Expected to update Craig Ehlo NBA question, updated %', updated_count;
  end if;

  update public.questions q
  set
    question_text = 'Which San Antonio Spurs forward won NBA Finals MVP in 2014?',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'nba'
    and q.id = '5902f15d-e174-4f34-9833-d61216ea76e3'::uuid;

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Expected to update 2014 Finals MVP NBA question, updated %', updated_count;
  end if;

  update public.questions q
  set
    question_text = 'Who scored 100 points in an NBA game in 1962? (The cameras weren''t on)',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'nba'
    and q.id = 'b6596b33-515c-45c2-b33b-fad95489a63a'::uuid;

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Expected to update Wilt 100-point NBA question, updated %', updated_count;
  end if;
end $$;
