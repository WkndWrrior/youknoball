with nfl_sport as (
  insert into public.sports (slug, name, is_active, sort_order)
  values ('nfl', 'NFL', true, 30)
  on conflict (slug) do update set
    name = excluded.name,
    is_active = true
  returning id
),
question_seed (
  difficulty,
  question_text,
  option_a,
  option_b,
  option_c,
  option_d,
  correct_option,
  source_notes
) as (
  values
    ('easy', 'Which team won Super Bowl LVII (57)?', 'Kansas City Chiefs', 'Philadelphia Eagles', 'Cincinnati Bengals', 'San Francisco 49ers', 'A', 'Verified against https://www.pro-football-reference.com/super-bowl/'),
    ('easy', 'Which team won Super Bowl LVIII (58)?', 'San Francisco 49ers', 'Kansas City Chiefs', 'Detroit Lions', 'Baltimore Ravens', 'B', 'Verified against https://www.pro-football-reference.com/super-bowl/'),
    ('easy', 'Who is the NFL''s all-time leader in regular-season passing yards?', 'Drew Brees', 'Peyton Manning', 'Tom Brady', 'Brett Favre', 'C', 'Verified against https://www.pro-football-reference.com/leaders/pass_yds_career.htm'),
    ('easy', 'Who is the NFL''s all-time leader in regular-season rushing yards?', 'Walter Payton', 'Barry Sanders', 'Adrian Peterson', 'Emmitt Smith', 'D', 'Verified against https://www.pro-football-reference.com/leaders/rush_yds_career.htm'),
    ('easy', 'Who is the NFL''s all-time leader in regular-season receiving yards?', 'Jerry Rice', 'Larry Fitzgerald', 'Terrell Owens', 'Randy Moss', 'A', 'Verified against https://www.pro-football-reference.com/leaders/rec_yds_career.htm'),
    ('easy', 'Which franchise is nicknamed America''s Team?', 'Pittsburgh Steelers', 'Dallas Cowboys', 'Green Bay Packers', 'Las Vegas Raiders', 'B', 'Verified against https://www.pro-football-reference.com/teams/dal/'),
    ('easy', 'Patrick Mahomes was drafted by which NFL team?', 'Chicago Bears', 'New York Jets', 'Kansas City Chiefs', 'Houston Texans', 'C', 'Verified against https://www.pro-football-reference.com/years/2017/draft.htm'),
    ('easy', 'Which team won Super Bowl I (1)?', 'Kansas City Chiefs', 'Dallas Cowboys', 'Oakland Raiders', 'Green Bay Packers', 'D', 'Verified against https://www.pro-football-reference.com/super-bowl/'),
    ('easy', 'Which quarterback won Super Bowls with both the Colts and Broncos?', 'Peyton Manning', 'Tom Brady', 'Drew Brees', 'Eli Manning', 'A', 'Verified against https://www.pro-football-reference.com/players/M/MannPe00.htm'),
    ('easy', 'Which team drafted Aaron Rodgers in 2005?', 'San Francisco 49ers', 'Green Bay Packers', 'Tampa Bay Buccaneers', 'Miami Dolphins', 'B', 'Verified against https://www.pro-football-reference.com/years/2005/draft.htm'),
    ('medium', 'Who returned the opening kickoff of Super Bowl XLI (41) for a touchdown?', 'Desmond Howard', 'Percy Harvin', 'Devin Hester', 'Jacoby Jones', 'C', 'Verified against https://www.pro-football-reference.com/boxscores/200702040chi.htm and https://www.pro-football-reference.com/super-bowl/'),
    ('medium', 'Which quarterback from the 2018 NFL Draft class won NFL MVP twice by the end of the 2023 season?', 'Baker Mayfield', 'Josh Allen', 'Sam Darnold', 'Lamar Jackson', 'D', 'Verified against https://www.pro-football-reference.com/years/2018/draft.htm and https://www.pro-football-reference.com/awards/ap-nfl-mvp-award.htm'),
    ('medium', 'Which team completed the NFL''s only undefeated Super Bowl-era season in 1972?', 'Miami Dolphins', 'Pittsburgh Steelers', 'Dallas Cowboys', 'Oakland Raiders', 'A', 'Verified against https://www.pro-football-reference.com/teams/mia/1972.htm'),
    ('medium', 'Who caught the Helmet Catch in Super Bowl XLII (42)?', 'Plaxico Burress', 'David Tyree', 'Amani Toomer', 'Mario Manningham', 'B', 'Verified against https://www.pro-football-reference.com/boxscores/200802030nwe.htm'),
    ('medium', 'Who made the goal-line interception that sealed Super Bowl XLIX (49) for New England?', 'Darrelle Revis', 'Devin McCourty', 'Malcolm Butler', 'Dont''a Hightower', 'C', 'Verified against https://www.pro-football-reference.com/boxscores/201502010sea.htm'),
    ('medium', 'Which Eagles quarterback caught the Philly Special touchdown in Super Bowl LII (52)?', 'Carson Wentz', 'Zach Ertz', 'Trey Burton', 'Nick Foles', 'D', 'Verified against https://www.pro-football-reference.com/boxscores/201802040nwe.htm'),
    ('medium', 'Which quarterback was selected first overall in the 2020 NFL Draft?', 'Joe Burrow', 'Tua Tagovailoa', 'Justin Herbert', 'Jordan Love', 'A', 'Verified against https://www.pro-football-reference.com/years/2020/draft.htm'),
    ('medium', 'Who produced the Beast Quake touchdown run for Seattle in the 2010 playoffs?', 'Russell Wilson', 'Marshawn Lynch', 'Shaun Alexander', 'Percy Harvin', 'B', 'Verified against https://www.pro-football-reference.com/boxscores/201101080sea.htm'),
    ('medium', 'Which team did Eli Manning beat twice in the Super Bowl?', 'Buffalo Bills', 'Dallas Cowboys', 'New England Patriots', 'Denver Broncos', 'C', 'Verified against https://www.pro-football-reference.com/super-bowl/'),
    ('medium', 'Which wide receiver won Super Bowl LVI (56) MVP?', 'Ja''Marr Chase', 'Odell Beckham Jr.', 'Tee Higgins', 'Cooper Kupp', 'D', 'Verified against https://www.pro-football-reference.com/boxscores/202202130cin.htm'),
    ('hard', 'Who is the only kicker to win AP NFL MVP?', 'Mark Moseley', 'Adam Vinatieri', 'Morten Andersen', 'Justin Tucker', 'A', 'Verified against https://www.pro-football-reference.com/awards/ap-nfl-mvp-award.htm'),
    ('hard', 'Which team became the first wild-card team to win the Super Bowl, doing it in Super Bowl XV (15)?', 'Philadelphia Eagles', 'Oakland Raiders', 'Denver Broncos', 'Dallas Cowboys', 'B', 'Verified against https://www.pro-football-reference.com/super-bowl/'),
    ('hard', 'Which Super Bowl was the first to go to overtime?', 'Super Bowl XLIX (49)', 'Super Bowl L (50)', 'Super Bowl LI (51)', 'Super Bowl LII (52)', 'C', 'Verified against https://www.pro-football-reference.com/boxscores/201702050atl.htm'),
    ('hard', 'Who was the first defensive player to win Super Bowl MVP, doing it in Super Bowl V (5)?', 'Ray Lewis', 'Harvey Martin', 'Randy White', 'Chuck Howley', 'D', 'Verified against https://www.nfl.com/super-bowl/history/mvp and https://www.pro-football-reference.com/boxscores/197101170clt.htm'),
    ('hard', 'Who caught Joe Montana''s winning touchdown pass in Super Bowl XXIII (23)?', 'John Taylor', 'Jerry Rice', 'Roger Craig', 'Brent Jones', 'A', 'Verified against https://www.pro-football-reference.com/boxscores/198901220cin.htm'),
    ('hard', 'Who scored the first touchdown in Super Bowl history?', 'Bart Starr', 'Max McGee', 'Elijah Pitts', 'Otis Taylor', 'B', 'Verified against https://www.pro-football-reference.com/boxscores/196701150gnb.htm'),
    ('hard', 'Which quarterback led the Greatest Show on Turf Rams to victory in Super Bowl XXXIV (34)?', 'Steve McNair', 'Trent Green', 'Kurt Warner', 'Marc Bulger', 'C', 'Verified against https://www.pro-football-reference.com/boxscores/200001300oti.htm'),
    ('hard', 'Which quarterback was selected first overall in the famous 1983 NFL Draft?', 'Jim Kelly', 'Dan Marino', 'Tony Eason', 'John Elway', 'D', 'Verified against https://www.pro-football-reference.com/years/1983/draft.htm'),
    ('hard', 'Which team beat Buffalo in the Wide Right game, Super Bowl XXV (25)?', 'New York Giants', 'Washington', 'Dallas Cowboys', 'San Francisco 49ers', 'A', 'Verified against https://www.pro-football-reference.com/boxscores/199101270buf.htm'),
    ('hard', 'Who was the first running back selected in the 2018 NFL Draft?', 'Rashaad Penny', 'Saquon Barkley', 'Sony Michel', 'Nick Chubb', 'B', 'Verified against https://www.pro-football-reference.com/years/2018/draft.htm')
),
inserted_questions as (
  insert into public.questions (
    id,
    sport_id,
    difficulty,
    question_text,
    option_a,
    option_b,
    option_c,
    option_d,
    correct_option,
    status,
    eligible_for_daily,
    eligible_for_sport_quiz,
    authoring_method,
    source_notes,
    reviewed_at
  )
  select
    gen_random_uuid(),
    nfl_sport.id,
    question_seed.difficulty,
    question_seed.question_text,
    question_seed.option_a,
    question_seed.option_b,
    question_seed.option_c,
    question_seed.option_d,
    question_seed.correct_option,
    'ready',
    true,
    true,
    'ai_assisted',
    question_seed.source_notes,
    timezone('utc', now())
  from nfl_sport
  cross join question_seed
  where not exists (
    select 1
    from public.questions existing
    where existing.sport_id = nfl_sport.id
      and existing.question_text = question_seed.question_text
  )
  returning id
)
select count(*) from inserted_questions;
