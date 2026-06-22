do $$
declare
  updated_count integer;
  retired_count integer;
begin
  with rewrites (id, question_text) as (
    values
      ('a3b3dcfb-ff7c-4c4f-a89a-1e4e0ad8cfd3'::uuid, 'Before the Chosen One headlines and NBA title runs, LeBron James grew up in what Ohio city?'),
      ('535678e8-85db-4138-9285-b12facb06904'::uuid, 'When the banner-count debates start, which franchise sits atop NBA history for most championships?'),
      ('385badf9-cdeb-4fbb-a092-b434dcfb5022'::uuid, 'After winning the 1997 draft lottery, which NBA team used the No. 1 pick on Tim Duncan?'),
      ('169f5245-60ed-46cb-9049-541cdd528d86'::uuid, 'Coach K built a dynasty on which college basketball campus?'),
      ('737b713f-b98c-44b7-b7d0-abe2577b4a09'::uuid, 'Which Big East school shocked Georgetown in the 1985 NCAA title game as an 8 seed?'),
      ('bb4a28b4-6b4f-486e-bf59-d1c67e288d02'::uuid, 'Before NBA range changed forever, Stephen Curry made March noise at which school?'),
      ('5e958c02-13b3-4e26-9e31-758fb3d898cd'::uuid, 'Which team kicked open the 16-over-1 door in the men''s NCAA tournament?'),
      ('5dd094c9-3233-461c-8a0e-5f4803cec72c'::uuid, 'Before the no-look throws and Super Bowl runs, Patrick Mahomes was drafted by which NFL team?'),
      ('6e97b812-b3cc-427f-b8d6-8dc51c1dea22'::uuid, 'After waiting through the 2005 draft green room slide, Aaron Rodgers landed with which team?'),
      ('3b21ecd5-4433-4459-9f56-18d7e1134c77'::uuid, 'The first Super Bowl belonged to which franchise?'),
      ('484c1b5c-5eab-46e9-8eb4-1395d8594482'::uuid, 'On the Giants'' wild final drive in Super Bowl XLII (42), who came down with the Helmet Catch?'),
      ('2d989d90-39bd-4c3f-8042-fa38385e0b36'::uuid, 'Before his NFL highlight reel, Barry Sanders put together a legendary 1988 Heisman season at which school?'),
      ('27f042af-4c8f-4c68-b9b3-84a3cff0c122'::uuid, 'Cam Newton won the 2010 Heisman while leading which school through a title season?'),
      ('98d47501-9167-4d9f-9f2b-7e69ad0005a0'::uuid, 'Johnny Football won the 2012 Heisman while playing for which school?'),
      ('81675aa5-95d1-4bdb-a1df-63aa68776fd1'::uuid, 'Joe Burrow''s 2019 Heisman season turned into a title run at which school?'),
      ('4bed1358-a5dd-47b9-acbc-00b3eccbe57d'::uuid, 'After chasing Gretzky''s mark for years, who now sits atop the NHL regular-season career goals list?'),
      ('9a2ee40b-0bd5-420c-a630-ffe1fc9c1a3b'::uuid, 'In a rare defenseman MVP season, who won the Hart Trophy in 2000?'),
      ('f4f00303-8bc9-47df-9ee4-3e1361583f71'::uuid, 'Which expansion team crashed all the way into the Stanley Cup Final in its first season?'),
      ('25e49625-1438-4b48-b5f6-e78cb3d9f56d'::uuid, 'Who scored the flying goal that clinched the 1970 Stanley Cup for Boston?'),
      ('2ac7842e-e38e-40b6-b760-a2dbc5310aa9'::uuid, 'Breaking baseball''s color barrier in 1947, Jackie Robinson debuted with which team?'),
      ('ef27c97a-10ef-4bba-be22-d6369cd9ae39'::uuid, 'Which team ended a 108-year wait by winning the 2016 World Series?'),
      ('9c4c6d5c-e401-4385-9dc0-f5e7081d6d72'::uuid, 'In the 1951 pennant race, who hit the Shot Heard Round the World?'),
      ('909be989-1352-49a8-99b4-b95aac8036f6'::uuid, 'In Game 5 of the 1956 World Series, who threw the only perfect game in World Series history?')
  )
  update public.questions q
  set
    question_text = rewrites.question_text,
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from rewrites
  where q.id = rewrites.id;

  get diagnostics updated_count = row_count;
  if updated_count <> 23 then
    raise exception 'Expected to rewrite 23 questions, rewrote %', updated_count;
  end if;

  update public.questions
  set
    status = 'retired',
    eligible_for_daily = false,
    eligible_for_sport_quiz = false,
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where id = '40aba988-14ba-4a99-aec8-897703ac7d5e'::uuid;

  get diagnostics retired_count = row_count;
  if retired_count <> 1 then
    raise exception 'Expected to retire 1 broad NFL GOAT question, retired %', retired_count;
  end if;
end $$;
