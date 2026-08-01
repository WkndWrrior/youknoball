do $$
declare
  updated_count integer;
begin
  update public.questions q
  set
    question_text = 'Which NBA franchise won 11 championships in 13 seasons from 1957 through 1969?',
    source_notes = 'Question bank quality audit, reviewed 2026-08-01. Sources: https://www.nba.com/celtics/news/sidebar/misc-20220105-sam-jones-was-winner-gentleman-and-mr-clutch',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'nba'
    and q.status = 'ready'
    and (
      q.id = '535678e8-85db-4138-9285-b12facb06904'::uuid
      or q.question_text = 'When the banner-count debates start, which franchise sits atop NBA history for most championships?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Question bank polish 535678e8-85db-4138-9285-b12facb06904 matched % rows', updated_count;
  end if;

  update public.questions q
  set
    question_text = 'Which NBA star was nicknamed "The Round Mound of Rebound"?',
    difficulty = 'easy',
    source_notes = 'Question bank quality audit, reviewed 2026-08-01. Sources: https://www.nba.com/news/history-nba-legend-charles-barkley',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'nba'
    and q.status = 'ready'
    and (
      q.id = '815c13f4-889a-4c17-a6b6-ec2c6c6a41c8'::uuid
      or q.question_text = 'Which player was nicknamed The Round Mound of Rebound?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Question bank polish 815c13f4-889a-4c17-a6b6-ec2c6c6a41c8 matched % rows', updated_count;
  end if;

  update public.questions q
  set
    difficulty = 'medium',
    source_notes = 'Question bank quality audit, reviewed 2026-08-01. Sources: https://www.nba.com/news/history-finals-mvp-winners',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'nba'
    and q.status = 'ready'
    and (
      q.id = 'f1b74737-81d6-48c8-a4e1-e62b688d0ff4'::uuid
      or q.question_text = 'Who won 2019 NBA Finals MVP with the Toronto Raptors?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Question bank polish f1b74737-81d6-48c8-a4e1-e62b688d0ff4 matched % rows', updated_count;
  end if;

  update public.questions q
  set
    question_text = 'Who became the NBA''s all-time regular-season scoring leader on February 7, 2023?',
    source_notes = 'Question bank quality audit, reviewed 2026-08-01. Sources: https://www.nba.com/news/lebron-james-sets-all-time-scoring-record-nba',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'nba'
    and q.status = 'ready'
    and (
      q.id = 'f971d39f-1d55-453d-848f-a19f174b368e'::uuid
      or q.question_text = 'Who is the NBA''s all-time regular-season scoring leader?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Question bank polish f971d39f-1d55-453d-848f-a19f174b368e matched % rows', updated_count;
  end if;

  update public.questions q
  set
    question_text = 'Before "The Chosen One" headlines and NBA title runs, LeBron James grew up in what Ohio city?',
    source_notes = 'Question bank quality audit, reviewed 2026-08-01. Sources: https://www.nba.com/news/starting-5-dec-30-2024',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'nba'
    and q.status = 'ready'
    and (
      q.id = 'a3b3dcfb-ff7c-4c4f-a89a-1e4e0ad8cfd3'::uuid
      or q.question_text = 'Before the Chosen One headlines and NBA title runs, LeBron James grew up in what Ohio city?'
      or q.question_text = 'LeBron James was born and raised in what Ohio city?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Question bank polish a3b3dcfb-ff7c-4c4f-a89a-1e4e0ad8cfd3 matched % rows', updated_count;
  end if;

  update public.questions q
  set
    question_text = 'Which Big East school shocked Georgetown in the 1985 NCAA men''s basketball title game as an 8 seed?',
    source_notes = 'Question bank quality audit, reviewed 2026-08-01. Sources: https://www.ncaa.com/basketball-men/d1/villanova-college-basketball-championships-complete-history',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'cbb'
    and q.status = 'ready'
    and (
      q.id = '737b713f-b98c-44b7-b7d0-abe2577b4a09'::uuid
      or q.question_text = 'Which Big East school shocked Georgetown in the 1985 NCAA title game as an 8 seed?'
      or q.question_text = 'Which Big East school won the 1985 national championship as an 8 seed?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Question bank polish 737b713f-b98c-44b7-b7d0-abe2577b4a09 matched % rows', updated_count;
  end if;

  update public.questions q
  set
    question_text = 'Who scored 39 points to lead Houston past UCLA in college basketball''s 1968 "Game of the Century"?',
    source_notes = 'Question bank quality audit, reviewed 2026-08-01. Sources: https://uhcougars.com/news/2023/2/10/general-transcendent-trailblazer-forever-cougar-elvin-hayes',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'cbb'
    and q.status = 'ready'
    and (
      q.id = '7226d02d-c30b-4d9c-a43d-83ae81f5bde9'::uuid
      or q.question_text = 'Who led Houston over UCLA in the 1968 Game of the Century?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Question bank polish 7226d02d-c30b-4d9c-a43d-83ae81f5bde9 matched % rows', updated_count;
  end if;

  update public.questions q
  set
    status = 'retired',
    eligible_for_daily = false,
    eligible_for_sport_quiz = false,
    source_notes = 'Question bank quality audit, reviewed 2026-08-01. Sources: https://www.ncaa.com/basketball-men/d1/villanova-college-basketball-championships-complete-history',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'cbb'
    and q.status = 'ready'
    and (
      q.id = 'c6d8b26c-e08a-4c48-984b-59d67a790000'::uuid
      or q.question_text = 'In the 1985 NCAA title-game upset, Villanova defeated which defending champion?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Question bank polish c6d8b26c-e08a-4c48-984b-59d67a790000 matched % rows', updated_count;
  end if;

  update public.questions q
  set
    question_text = 'Which team did Kentucky beat to win the 2012 NCAA men''s basketball championship?',
    source_notes = 'Question bank quality audit, reviewed 2026-08-01. Sources: https://www.ncaa.com/news/basketball-men/article/2020-05-11/2012-ncaa-tournament-bracket-scores-stats-records',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'cbb'
    and q.status = 'ready'
    and (
      q.id = 'b8889027-4618-45fd-a9b4-4ae44efd2398'::uuid
      or q.question_text = 'Which team beat Kentucky to win the 2012 national championship?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Question bank polish b8889027-4618-45fd-a9b4-4ae44efd2398 matched % rows', updated_count;
  end if;

  update public.questions q
  set
    question_text = 'Which NFL team selected LSU receiver Justin Jefferson with the 22nd pick of the 2020 draft?',
    source_notes = 'Question bank quality audit, reviewed 2026-08-01. Sources: https://www.nfl.com/draft/tracker/2020/rounds/1',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'nfl'
    and q.status = 'ready'
    and (
      q.id = '5423a49d-d5d7-4872-9526-3cc035c16a07'::uuid
      or q.question_text = 'Before becoming Minnesota''s star receiver, Justin Jefferson was drafted by which team in 2020?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Question bank polish 5423a49d-d5d7-4872-9526-3cc035c16a07 matched % rows', updated_count;
  end if;

  update public.questions q
  set
    question_text = 'Which NFL franchise is nicknamed "America''s Team"?',
    source_notes = 'Question bank quality audit, reviewed 2026-08-01. Sources: https://www.nfl.com/news/packers-jaguars-among-america-s-team-candidates-after-boys-0ap3000000961379',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'nfl'
    and q.status = 'ready'
    and (
      q.id = '4a0c2441-2e3b-425a-8fb8-8ace8c037611'::uuid
      or q.question_text = 'Which franchise is nicknamed America''s Team?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Question bank polish 4a0c2441-2e3b-425a-8fb8-8ace8c037611 matched % rows', updated_count;
  end if;

  update public.questions q
  set
    question_text = 'Which quarterback led the "Greatest Show on Turf" Rams to victory in Super Bowl XXXIV (34)?',
    source_notes = 'Question bank quality audit, reviewed 2026-08-01. Sources: https://www.nfl.com/photos/greatest-show-on-turf-0ap2000000362117',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'nfl'
    and q.status = 'ready'
    and (
      q.id = 'ae679d0a-6067-4646-8d5a-5eee965fad45'::uuid
      or q.question_text = 'Which quarterback led the Greatest Show on Turf Rams to victory in Super Bowl XXXIV (34)?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Question bank polish ae679d0a-6067-4646-8d5a-5eee965fad45 matched % rows', updated_count;
  end if;

  update public.questions q
  set
    question_text = 'Who produced the "Beast Quake" touchdown run for Seattle in the 2010 playoffs?',
    source_notes = 'Question bank quality audit, reviewed 2026-08-01. Sources: https://www.seahawks.com/news/reliving-the-beast-quake-game-10-years-later',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'nfl'
    and q.status = 'ready'
    and (
      q.id = 'f395e563-5a9d-4489-87bd-b798e3171f10'::uuid
      or q.question_text = 'Who produced the Beast Quake touchdown run for Seattle in the 2010 playoffs?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Question bank polish f395e563-5a9d-4489-87bd-b798e3171f10 matched % rows', updated_count;
  end if;

  update public.questions q
  set
    question_text = 'Which team beat Buffalo in the "Wide Right" game, Super Bowl XXV (25)?',
    source_notes = 'Question bank quality audit, reviewed 2026-08-01. Sources: https://www.nfl.com/photos/super-bowl-memories-09000d5d82667042',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'nfl'
    and q.status = 'ready'
    and (
      q.id = 'c2aafb44-7663-4931-8384-b7c7ecabf099'::uuid
      or q.question_text = 'Which team beat Buffalo in the Wide Right game, Super Bowl XXV (25)?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Question bank polish c2aafb44-7663-4931-8384-b7c7ecabf099 matched % rows', updated_count;
  end if;

  update public.questions q
  set
    question_text = 'Which Eagles player caught the "Philly Special" touchdown in Super Bowl LII (52)?',
    source_notes = 'Question bank quality audit, reviewed 2026-08-01. Sources: https://www.nfl.com/100/originals/100-greatest/detail.html?slug=plays-10',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'nfl'
    and q.status = 'ready'
    and (
      q.id = 'f210fcb0-e997-45d5-8e7b-bb9089baedd9'::uuid
      or q.question_text = 'Which Eagles quarterback caught the Philly Special touchdown in Super Bowl LII (52)?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Question bank polish f210fcb0-e997-45d5-8e7b-bb9089baedd9 matched % rows', updated_count;
  end if;

  update public.questions q
  set
    question_text = 'Who scored the first touchdown in Super Bowl I (1)?',
    source_notes = 'Question bank quality audit, reviewed 2026-08-01. Sources: https://www.nfl.com/photos/max-mcgee-1932-2007-09000d5d80376fbb',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'nfl'
    and q.status = 'ready'
    and (
      q.id = 'd20244b4-13fb-4a33-acbb-2c7591d6d345'::uuid
      or q.question_text = 'Who scored the first touchdown in Super Bowl history?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Question bank polish d20244b4-13fb-4a33-acbb-2c7591d6d345 matched % rows', updated_count;
  end if;

  update public.questions q
  set
    question_text = 'Which franchise won Super Bowl I (1)?',
    source_notes = 'Question bank quality audit, reviewed 2026-08-01. Sources: https://www.nfl.com/photos/super-bowl-i-09000d5d8020f107',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'nfl'
    and q.status = 'ready'
    and (
      q.id = '3b21ecd5-4433-4459-9f56-18d7e1134c77'::uuid
      or q.question_text = 'The first Super Bowl belonged to which franchise?'
      or q.question_text = 'Which team won Super Bowl I (1)?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Question bank polish 3b21ecd5-4433-4459-9f56-18d7e1134c77 matched % rows', updated_count;
  end if;

  update public.questions q
  set
    question_text = 'On the Giants'' wild final drive in Super Bowl XLII (42), who came down with the "Helmet Catch"?',
    source_notes = 'Question bank quality audit, reviewed 2026-08-01. Sources: https://www.nfl.com/100/originals/100-greatest/detail.html?slug=plays-3',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'nfl'
    and q.status = 'ready'
    and (
      q.id = '484c1b5c-5eab-46e9-8eb4-1395d8594482'::uuid
      or q.question_text = 'On the Giants'' wild final drive in Super Bowl XLII (42), who came down with the Helmet Catch?'
      or q.question_text = 'Who caught the Helmet Catch in Super Bowl XLII (42)?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Question bank polish 484c1b5c-5eab-46e9-8eb4-1395d8594482 matched % rows', updated_count;
  end if;

  update public.questions q
  set
    status = 'retired',
    eligible_for_daily = false,
    eligible_for_sport_quiz = false,
    source_notes = 'Question bank quality audit, reviewed 2026-08-01. Sources: https://www.ncaa.com/news/football/article/2018-11-02/longest-winning-streaks-college-football-history',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'cfb'
    and q.status = 'ready'
    and (
      q.id = 'bfcff20c-ae61-4188-a9a8-b2eb9fdcb5da'::uuid
      or q.question_text = 'Oklahoma''s record major-college winning streak stopped at what number?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Question bank polish bfcff20c-ae61-4188-a9a8-b2eb9fdcb5da matched % rows', updated_count;
  end if;

  update public.questions q
  set
    question_text = '"Johnny Football" won the 2012 Heisman while playing for which school?',
    source_notes = 'Question bank quality audit, reviewed 2026-08-01. Sources: https://www.heisman.com/articles/this-week-in-heisman-history-johnny-manziel-sets-sec-total-offense-mark-in-victory-over-arkansas/',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'cfb'
    and q.status = 'ready'
    and (
      q.id = '98d47501-9167-4d9f-9f2b-7e69ad0005a0'::uuid
      or q.question_text = 'Johnny Football won the 2012 Heisman while playing for which school?'
      or q.question_text = 'Which school did Johnny Manziel represent when he won the 2012 Heisman Trophy?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Question bank polish 98d47501-9167-4d9f-9f2b-7e69ad0005a0 matched % rows', updated_count;
  end if;

  update public.questions q
  set
    question_text = 'Which Heisman Trophy winner also played in the 1963 NCAA men''s basketball Final Four?',
    source_notes = 'Question bank quality audit, reviewed 2026-08-01. Sources: https://www.heisman.com/heisman-winners/terry-baker/, https://osubeavers.com/honors/hall-of-fame/terry--baker/154',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'cfb'
    and q.status = 'ready'
    and (
      q.id = '051d193c-b8a1-4d2d-888b-631a9bcdc0da'::uuid
      or q.question_text = 'Which Heisman winner also took his Oregon State Beavers to the NCAA basketball Final Four?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Question bank polish 051d193c-b8a1-4d2d-888b-631a9bcdc0da matched % rows', updated_count;
  end if;

  update public.questions q
  set
    question_text = 'Which Baseball Hall of Famer was nicknamed "the Bambino" and "the Sultan of Swat"?',
    source_notes = 'Question bank quality audit, reviewed 2026-08-01. Sources: https://baseballhall.org/hall-of-famers/ruth-babe',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'mlb'
    and q.status = 'ready'
    and (
      q.id = '9e138209-3ae9-4ec2-bc15-0cfe16121edb'::uuid
      or q.question_text = 'Which Hall of Famer was nicknamed the Bambino and the Sultan of Swat?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Question bank polish 9e138209-3ae9-4ec2-bc15-0cfe16121edb matched % rows', updated_count;
  end if;

  update public.questions q
  set
    question_text = 'Who ended a 45-year drought by winning MLB''s batting Triple Crown in 2012?',
    source_notes = 'Question bank quality audit, reviewed 2026-08-01. Sources: https://www.mlb.com/news/a-look-at-baseball-triple-crown-winners',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'mlb'
    and q.status = 'ready'
    and (
      q.id = '1f3f79a2-5e04-4c60-99f3-98005743442e'::uuid
      or q.question_text = 'Who won MLB''s most recent batting Triple Crown in 2012?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Question bank polish 1f3f79a2-5e04-4c60-99f3-98005743442e matched % rows', updated_count;
  end if;

  update public.questions q
  set
    difficulty = 'medium',
    source_notes = 'Question bank quality audit, reviewed 2026-08-01. Sources: https://baseballhall.org/hall-of-famers/ripken-cal',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'mlb'
    and q.status = 'ready'
    and (
      q.id = '2702b046-3b1d-4b78-b557-d14301d30a6c'::uuid
      or q.question_text = 'Who set MLB''s consecutive games played record at 2,632?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Question bank polish 2702b046-3b1d-4b78-b557-d14301d30a6c matched % rows', updated_count;
  end if;

  update public.questions q
  set
    question_text = 'Which franchise finally broke through for its first World Series championship in 1955?',
    source_notes = 'Question bank quality audit, reviewed 2026-08-01. Sources: https://www.mlb.com/postseason/history/1955',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'mlb'
    and q.status = 'ready'
    and (
      q.id = '99038afd-d614-4788-9e2a-c866b755db0e'::uuid
      or q.question_text = 'Which team won the 1955 World Series for Brooklyn''s first championship?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Question bank polish 99038afd-d614-4788-9e2a-c866b755db0e matched % rows', updated_count;
  end if;

  update public.questions q
  set
    difficulty = 'medium',
    source_notes = 'Question bank quality audit, reviewed 2026-08-01. Sources: https://www.mlb.com/news/mlb-single-season-home-run-record',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'mlb'
    and q.status = 'ready'
    and (
      q.id = '9aab2901-c4e4-469c-8ab7-7e58fd21a09f'::uuid
      or q.question_text = 'Who holds MLB''s single-season home run record with 73 in 2001?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Question bank polish 9aab2901-c4e4-469c-8ab7-7e58fd21a09f matched % rows', updated_count;
  end if;

  update public.questions q
  set
    question_text = 'Which MLB franchise relocated to Washington, D.C., and became the Nationals before the 2005 season?',
    source_notes = 'Question bank quality audit, reviewed 2026-08-01. Sources: https://www.mlb.com/nationals/history/timeline-2000s',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'mlb'
    and q.status = 'ready'
    and (
      q.id = '9135ed53-9166-4d0b-92b4-e9349c6e6179'::uuid
      or q.question_text = 'Which former MLB franchise moved from Montreal to Washington before the 2005 season?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Question bank polish 9135ed53-9166-4d0b-92b4-e9349c6e6179 matched % rows', updated_count;
  end if;

  update public.questions q
  set
    difficulty = 'medium',
    source_notes = 'Question bank quality audit, reviewed 2026-08-01. Sources: https://www.mlb.com/news/first-world-series-appearance-for-every-mlb-team',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'mlb'
    and q.status = 'ready'
    and (
      q.id = '96942dc2-29e1-4fa2-b08e-9f7118f299cc'::uuid
      or q.question_text = 'Which club won the first modern World Series in 1903?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Question bank polish 96942dc2-29e1-4fa2-b08e-9f7118f299cc matched % rows', updated_count;
  end if;

  update public.questions q
  set
    question_text = 'In the decisive Game 3 of the 1951 NL pennant tiebreaker, who hit the "Shot Heard Round the World"?',
    source_notes = 'Question bank quality audit, reviewed 2026-08-01. Sources: https://www.mlb.com/news/history-of-mlb-tiebreaker-games-c202246862',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'mlb'
    and q.status = 'ready'
    and (
      q.id = '9c4c6d5c-e401-4385-9dc0-f5e7081d6d72'::uuid
      or q.question_text = 'In the 1951 pennant race, who hit the Shot Heard Round the World?'
      or q.question_text = 'Who hit the 1951 Shot Heard Round the World?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Question bank polish 9c4c6d5c-e401-4385-9dc0-f5e7081d6d72 matched % rows', updated_count;
  end if;

  update public.questions q
  set
    question_text = 'After the final out of the "Fall Classic," what trophy goes to the World Series champion?',
    source_notes = 'Question bank quality audit, reviewed 2026-08-01. Sources: https://www.mlb.com/glossary/miscellaneous/commissioners-trophy',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'mlb'
    and q.status = 'ready'
    and (
      q.id = '0ffd45c7-8d3e-49d4-bc7d-a525526c001b'::uuid
      or q.question_text = 'After the final out of the Fall Classic, what trophy goes to the World Series champion?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Question bank polish 0ffd45c7-8d3e-49d4-bc7d-a525526c001b matched % rows', updated_count;
  end if;

  update public.questions q
  set
    question_text = 'Who scored the fastest hat trick in NHL history, firing three goals in just 21 seconds?',
    source_notes = 'Question bank quality audit, reviewed 2026-08-01. Sources: https://www.nhl.com/news/bill-mosienko-scores-fastest-hat-trick-in-nhl-history-290802314',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'nhl'
    and q.status = 'ready'
    and (
      q.id = 'f8a4a870-5132-4408-b2d1-99802c937754'::uuid
      or q.question_text = 'Who scored the fastest hat trick in NHL history?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Question bank polish f8a4a870-5132-4408-b2d1-99802c937754 matched % rows', updated_count;
  end if;

  update public.questions q
  set
    question_text = 'Who broke Wayne Gretzky''s NHL record of 894 regular-season goals in April 2025?',
    source_notes = 'Question bank quality audit, reviewed 2026-08-01. Sources: https://www.nhl.com/news/alex-ovechkin-passes-wayne-gretzky-for-nhl-goals-record',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'nhl'
    and q.status = 'ready'
    and (
      q.id = '4bed1358-a5dd-47b9-acbc-00b3eccbe57d'::uuid
      or q.question_text = 'After chasing Gretzky''s mark for years, who now sits atop the NHL regular-season career goals list?'
      or q.question_text = 'Who is the NHL''s all-time leader in career regular-season goals?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Question bank polish 4bed1358-a5dd-47b9-acbc-00b3eccbe57d matched % rows', updated_count;
  end if;

  update public.questions q
  set
    difficulty = 'medium',
    source_notes = 'Question bank quality audit, reviewed 2026-08-01. Sources: https://www.nhl.com/news/golden-knights-magic-runs-out-in-stanley-cup-final-against-capitals-299000478',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.sports s
  where q.sport_id = s.id
    and s.slug = 'nhl'
    and q.status = 'ready'
    and (
      q.id = 'f4f00303-8bc9-47df-9ee4-3e1361583f71'::uuid
      or q.question_text = 'Which expansion team crashed all the way into the Stanley Cup Final in its first season?'
      or q.question_text = 'Which expansion team reached the Stanley Cup Final in its inaugural 2017-18 season?'
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Question bank polish f4f00303-8bc9-47df-9ee4-3e1361583f71 matched % rows', updated_count;
  end if;

end $$;
