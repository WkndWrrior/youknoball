do $$
declare
  updated_count integer;
begin
  update public.questions q
  set
    question_text = 'In the 1974 NCAA men''s basketball semifinals, which team ended UCLA''s run of seven straight national titles with a double-overtime win, then claimed the championship?',
    source_notes = 'Verified against https://www.ncaa.com/news/basketball-men/article/2020-05-18/1974-ncaa-tournament-bracket-scores-stats-records',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'cbb'
    and q.status = 'ready'
    and (
      q.id = '101635c2-dbd2-4384-b954-a8e5bf9594c6'::uuid
      or q.question_text = 'Which team beat UCLA in the 1974 national semifinals before winning the title?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Expected to update 1974 UCLA CBB question, updated %', updated_count;
  end if;

  update public.questions q
  set
    question_text = 'In 1921, which college football rivalry matchup became the first game broadcast on radio?',
    source_notes = 'Verified against https://www.ncaa.com/news/ncaa/article/2020-01-31/college-football-history-notable-firsts-and-milestones',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'cfb'
    and q.status = 'ready'
    and (
      q.id = '12a9ce1c-9b4b-4e15-a65f-1084b2f43c08'::uuid
      or q.question_text = 'Which matchup was the first college football game broadcast on radio?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Expected to update first radio CFB question, updated %', updated_count;
  end if;

  update public.questions q
  set
    question_text = 'Which school won the 1997 NCAA men''s basketball title behind freshman phenom Mike Bibby, knocking off three No. 1 seeds along the way?',
    source_notes = 'Verified against https://www.ncaa.com/news/basketball-men/article/2020-05-08/1997-ncaa-tournament-bracket-scores-stats-records',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'cbb'
    and q.status = 'ready'
    and (
      q.id = '13724d84-8706-4948-a263-60971cf8158c'::uuid
      or q.question_text = 'Which school won the 1997 national title behind freshman Mike Bibby?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Expected to update 1997 Arizona CBB question, updated %', updated_count;
  end if;

  update public.questions q
  set
    question_text = '"Coach K" built a dynasty on which college basketball campus?',
    source_notes = 'Verified against https://goduke.com/staff-directory/mike-krzyzewski/159',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'cbb'
    and q.status = 'ready'
    and (
      q.id = '169f5245-60ed-46cb-9049-541cdd528d86'::uuid
      or q.question_text = 'Coach K built a dynasty on which college basketball campus?'
      or q.question_text = 'Mike Krzyzewski became a coaching legend at which school?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Expected to update Coach K CBB question, updated %', updated_count;
  end if;

  update public.questions q
  set
    question_text = 'Which college football program owns the major-college record with a 47-game winning streak from 1953 to 1957?',
    difficulty = 'medium',
    source_notes = 'Verified against https://www.ncaa.com/news/football/article/2018-11-02/longest-winning-streaks-college-football-history',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'cfb'
    and q.status = 'ready'
    and (
      q.id = '16e44025-d542-421e-b95e-5e787fed003c'::uuid
      or q.question_text = 'Which program owns the major-college record 47-game winning streak?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Expected to update Oklahoma streak CFB question, updated %', updated_count;
  end if;

  update public.questions q
  set
    question_text = 'Without a 3-point line or shot clock, which player scored 3,667 points in just three varsity seasons to become Division I men''s basketball''s all-time leading scorer?',
    difficulty = 'medium',
    source_notes = 'Verified against https://lsusports.net/news/2018/02/28/211703254',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'cbb'
    and q.status = 'ready'
    and (
      q.id = '1b866dd0-732e-4139-a468-8ed397768104'::uuid
      or q.question_text = 'Who is the all-time leading scorer in Division I men''s basketball?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Expected to update Maravich CBB question, updated %', updated_count;
  end if;

  update public.questions q
  set
    question_text = 'Which Portland, Oregon, high school product became the first player from the West Coast to win the Heisman Trophy in 1962?',
    source_notes = 'Verified against https://www.heisman.com/heisman-winners/terry-baker/',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'cfb'
    and q.status = 'ready'
    and (
      q.id = '1e5f8ca2-2864-475e-a365-372071f0323c'::uuid
      or q.question_text = 'Who was the first West Coast player to win the Heisman Trophy?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Expected to update Terry Baker CFB question, updated %', updated_count;
  end if;

  update public.questions q
  set
    question_text = 'After a 31-8 season and six double-digit NCAA tournament wins, who coached UConn to the 2023 men''s basketball national title?',
    source_notes = 'Verified against https://uconnhuskies.com/news/2023/4/3/mens-basketball-uconn-wins-march-madness-with-76-59-smothering-of-sdsu',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'cbb'
    and q.status = 'ready'
    and (
      q.id = '664e8135-bf10-4642-94fd-b4209a302c51'::uuid
      or q.question_text = 'Who coached UConn through its dominant 2023 men''s title run?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Expected to update active UConn CBB question, updated %', updated_count;
  end if;
end $$;
