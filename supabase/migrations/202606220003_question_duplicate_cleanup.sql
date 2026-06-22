do $$
declare
  retired_count integer;
  updated_count integer;
begin
  update public.questions
  set
    status = 'retired',
    eligible_for_daily = false,
    eligible_for_sport_quiz = false,
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where id = any(array[
    'f5a22313-2319-43f4-a26b-779ffc9b3704',
    '14e2c0ff-1cc2-4b0d-9b32-801acfa77883',
    '3729c794-bce4-483f-bd32-81358634ec1b',
    'd854fe03-ba10-4ab5-9b38-a8d766773467',
    '72353fb9-5cf4-4379-a1a9-e41ead7aaad7',
    '11dde035-492b-41f0-b706-74b5a05bcf72',
    '960711eb-831d-40eb-a611-344b29339d43',
    'fa297988-0b29-43a0-af15-11fabbd7c036',
    '751e73a0-6fa7-4072-bf58-9421436ae93c',
    '4ff55410-53a8-4c2d-98c9-a91cb3b343ad',
    '4f9d6e67-0b76-4cdf-91ae-b4f2c3c68f81'
  ]::uuid[]);

  get diagnostics retired_count = row_count;
  if retired_count <> 11 then
    raise exception 'Expected to retire 11 duplicate or fragile questions, retired %', retired_count;
  end if;

  update public.questions
  set
    question_text = 'Before going No. 1 in the NBA Draft, Zion Williamson turned one season at which school into must-see TV?',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where id = '3f51ba05-1463-45da-a36a-02dc29193e2f'::uuid;

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Expected to update Zion CBB question, updated %', updated_count;
  end if;

  update public.questions
  set
    question_text = 'Who coached UConn through its dominant 2023 men''s title run?',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where id = '664e8135-bf10-4642-94fd-b4209a302c51'::uuid;

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Expected to update UConn CBB question, updated %', updated_count;
  end if;

  update public.questions
  set
    question_text = 'In Super Bowl XLVIII (48), which team''s star-studded defense turned Denver''s record-setting offense into a long night?',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where id = '98ed8e4f-efdb-428d-afb5-d2d3711bddb3'::uuid;

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Expected to update Super Bowl XLVIII NFL question, updated %', updated_count;
  end if;

  update public.questions
  set
    question_text = 'Which running back still owns the NFL single-season rushing record from his monster 1984 season?',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where id = '8901bce9-423c-4413-bd5c-06bdeaa1fe1a'::uuid;

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Expected to update NFL rushing record question, updated %', updated_count;
  end if;

  update public.questions
  set
    question_text = 'Sidney Crosby was drafted first overall in 2005 by which team?',
    source_notes = 'Updated during question review. Verified against https://www.hockey-reference.com/draft/NHL_2005_entry.html',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where id = '1104ac8f-7d5f-4de4-9cd5-8e2df1e5618e'::uuid;

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Expected to update Sidney Crosby NHL question, updated %', updated_count;
  end if;
end $$;
