do $$
declare
  updated_count integer;
  retired_count integer;
begin
  with rewrites (sport_slug, id, old_question_text, question_text) as (
    values
      ('nba', '8aa148a0-b1ab-4abc-9f59-689dff6dd8e1'::uuid, 'Which team won the 2024 NBA Finals?', 'After finishing off Dallas in five games, which team won the 2024 NBA Finals?'),
      ('nba', '32823a2d-fae3-445e-890d-122aa176436b'::uuid, 'Which rookie won Finals MVP for the Lakers in 1980?', 'With Kareem injured and Game 6 on the road, which Lakers rookie won Finals MVP in 1980?'),
      ('nba', 'c34057e7-5e04-487b-a4e6-bb5ec872d468'::uuid, 'Who was the first NBA Finals MVP in 1969?', 'In 1969, who became the first NBA Finals MVP while playing for the losing team?'),
      ('nba', 'cf94111f-a43f-4d51-9f2f-b40c051a4b3e'::uuid, 'Who is the NBA''s official all-time blocks leader?', 'Since blocks became official in 1973-74, who sits first on the NBA career blocks list?'),
      ('nfl', '5423a49d-d5d7-4872-9526-3cc035c16a07'::uuid, 'Which team does Justin Jefferson play for?', 'Before becoming Minnesota''s star receiver, Justin Jefferson was drafted by which team in 2020?'),
      ('nfl', '01c08ca5-d344-4c28-9cb4-69450e3e5cf2'::uuid, 'Which team won Super Bowl LVII (57)?', 'In Super Bowl LVII (57), which team survived Philadelphia in a 38-35 shootout?'),
      ('nfl', '7e66256e-13cb-416d-ae23-a51bc8e2738b'::uuid, 'Which team won Super Bowl LVIII (58)?', 'In Super Bowl LVIII (58), which team beat San Francisco in overtime?'),
      ('nfl', 'c9d277d9-2fa3-4bdd-b6fe-27a5c82b8d2e'::uuid, 'Who was named Super Bowl MVP in Super Bowl LVII?', 'After a second-half ankle scare and a late scoring drive, who was named Super Bowl LVII (57) MVP?'),
      ('cbb', 'c6d8b26c-e08a-4c48-984b-59d67a790000'::uuid, 'In the 1985 title game upset, Villanova defeated which team?', 'In the 1985 NCAA title-game upset, Villanova defeated which defending champion?'),
      ('cbb', '5b5c0d30-9c5a-4597-b2ae-9c616830d6f7'::uuid, 'Which school won the 2019 men''s national championship?', 'A year after becoming the first 1 seed to fall to a 16, which school won the 2019 men''s national championship?'),
      ('cbb', '98bb9b9f-9599-43dd-a997-40afbd0a6e55'::uuid, 'Who hit the game-winning shot for NC State in the 1983 national championship game?', 'At the horn in the 1983 title game, who finished NC State''s famous putback winner?'),
      ('cfb', '59d233a1-6375-44f0-b2fe-0c17f3ae4c3d'::uuid, 'At which school did Archie Griffin win two Heisman Trophies?', 'At which school did Archie Griffin become the only two-time Heisman Trophy winner?'),
      ('cfb', 'bfcff20c-ae61-4188-a9a8-b2eb9fdcb5da'::uuid, 'How many consecutive games did Oklahoma win during its record major-college streak?', 'Oklahoma''s record major-college winning streak stopped at what number?'),
      ('cfb', 'fad1304a-1126-45fb-a542-fab6bd55ec48'::uuid, 'Which team ended Oklahoma''s record 47-game winning streak?', 'Which team finally snapped Oklahoma''s record 47-game winning streak in 1957?'),
      ('nhl', 'a2d2788c-2659-4dd3-ba8f-3f845a5bb26f'::uuid, 'What trophy is awarded to the NHL playoff champion?', 'After the handshake line, what trophy goes to the NHL playoff champion?'),
      ('nhl', 'b1968780-2cb2-4132-8d1c-e268df49765f'::uuid, 'Which team won the 2024 Stanley Cup Final?', 'After surviving Edmonton in Game 7, which team won the 2024 Stanley Cup Final?'),
      ('mlb', '0ffd45c7-8d3e-49d4-bc7d-a525526c001b'::uuid, 'What trophy is awarded to the World Series champion?', 'After the final out of the Fall Classic, what trophy goes to the World Series champion?'),
      ('mlb', '410ce06b-2626-4bfc-81cc-b2cdb954a40c'::uuid, 'Which dominant Yankees closer allowed only 11 earned runs across his postseason career?', 'Which dominant Yankees closer allowed only 11 postseason earned runs, fewer than the 12 people who have walked on the moon?')
  )
  update public.questions q
  set
    question_text = rewrites.question_text,
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from rewrites
  join public.sports s
    on s.slug = rewrites.sport_slug
  where q.sport_id = s.id
    and (
      q.id = rewrites.id
      or q.question_text = rewrites.old_question_text
    );

  get diagnostics updated_count = row_count;
  if updated_count <> 18 then
    raise exception 'Expected to polish 18 questions, polished %', updated_count;
  end if;

  with retirements (sport_slug, id, question_text) as (
    values
      ('nhl', '7bb1be85-6042-48df-866a-049b2ecc8d2e'::uuid, 'Which goalie holds the NHL record for most career wins?'),
      ('nhl', '6e004d9a-a39d-4ea6-a1b6-c9821b7796eb'::uuid, 'Which team won the 2023 Stanley Cup?')
  )
  update public.questions q
  set
    status = 'retired',
    eligible_for_daily = false,
    eligible_for_sport_quiz = false,
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from retirements
  join public.sports s
    on s.slug = retirements.sport_slug
  where q.sport_id = s.id
    and (
      q.id = retirements.id
      or q.question_text = retirements.question_text
    );

  get diagnostics retired_count = row_count;
  if retired_count <> 2 then
    raise exception 'Expected to retire 2 duplicate NHL questions, retired %', retired_count;
  end if;
end $$;
