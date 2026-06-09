with cfb_sport as (
  insert into public.sports (slug, name, is_active, sort_order)
  values ('cfb', 'CFB', true, 40)
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
    ('easy', 'Which school did Joe Burrow represent when he won the 2019 Heisman Trophy?', 'LSU', 'Ohio State', 'Clemson', 'Alabama', 'A', 'Verified against https://www.heisman.com/heisman-winners/'),
    ('easy', 'Which school did Cam Newton represent when he won the 2010 Heisman Trophy?', 'Florida', 'Auburn', 'Alabama', 'Georgia', 'B', 'Verified against https://www.heisman.com/heisman-winners/'),
    ('easy', 'Which school did Tim Tebow represent when he won the 2007 Heisman Trophy?', 'Florida State', 'Miami', 'Florida', 'Georgia', 'C', 'Verified against https://www.heisman.com/heisman-winners/'),
    ('easy', 'Which school did Lamar Jackson represent when he won the 2016 Heisman Trophy?', 'Kentucky', 'Clemson', 'Miami', 'Louisville', 'D', 'Verified against https://www.heisman.com/heisman-winners/'),
    ('easy', 'Which school did Barry Sanders represent when he won the 1988 Heisman Trophy?', 'Oklahoma State', 'Oklahoma', 'Nebraska', 'Kansas State', 'A', 'Verified against https://www.heisman.com/heisman-winners/'),
    ('easy', 'Which school did Charles Woodson represent when he won the 1997 Heisman Trophy?', 'Ohio State', 'Michigan', 'Notre Dame', 'Penn State', 'B', 'Verified against https://www.heisman.com/heisman-winners/'),
    ('easy', 'Which school did Johnny Manziel represent when he won the 2012 Heisman Trophy?', 'Texas', 'Oklahoma', 'Texas A&M', 'Baylor', 'C', 'Verified against https://www.heisman.com/heisman-winners/'),
    ('easy', 'At which school did Archie Griffin win two Heisman Trophies?', 'Michigan', 'USC', 'Notre Dame', 'Ohio State', 'D', 'Verified against https://www.heisman.com/heisman-winners/'),
    ('easy', 'Which school won the first recognized college football game in 1869?', 'Rutgers', 'Princeton', 'Yale', 'Harvard', 'A', 'Verified against https://www.ncaa.com/news/football/article/2017-11-06/college-football-history-heres-when-1st-game-was-played'),
    ('easy', 'Which program owns the major-college record 47-game winning streak?', 'Alabama', 'Oklahoma', 'Miami', 'USC', 'B', 'Verified against https://www.ncaa.com/news/football/article/2018-11-02/longest-winning-streaks-college-football-history'),
    ('medium', 'Who was the first winner of the Heisman Trophy?', 'Archie Griffin', 'Nile Kinnick', 'Jay Berwanger', 'Doc Blanchard', 'C', 'Verified against https://www.heisman.com/about-the-heisman/milestones/'),
    ('medium', 'Who is the only player to win the Heisman Trophy twice?', 'Tim Tebow', 'Matt Leinart', 'Bo Jackson', 'Archie Griffin', 'D', 'Verified against https://www.heisman.com/about-the-heisman/milestones/'),
    ('medium', 'Who was the first Black player to win the Heisman Trophy?', 'Ernie Davis', 'Jim Brown', 'Archie Griffin', 'Johnny Rodgers', 'A', 'Verified against https://www.heisman.com/about-the-heisman/milestones/'),
    ('medium', 'Who was the first sophomore to win the Heisman Trophy?', 'Lamar Jackson', 'Tim Tebow', 'Johnny Manziel', 'Adrian Peterson', 'B', 'Verified against https://www.heisman.com/about-the-heisman/milestones/'),
    ('medium', 'Who was the first redshirt freshman to win the Heisman Trophy?', 'Jameis Winston', 'Tim Tebow', 'Johnny Manziel', 'Trevor Lawrence', 'C', 'Verified against https://www.heisman.com/about-the-heisman/milestones/'),
    ('medium', 'Who is the only Heisman winner whose team had a losing record?', 'George Rogers', 'Tim Brown', 'John David Crow', 'Paul Hornung', 'D', 'Verified against https://www.heisman.com/about-the-heisman/milestones/'),
    ('medium', 'Who was the first wide receiver to win the Heisman Trophy?', 'Johnny Rodgers', 'Tim Brown', 'Desmond Howard', 'DeVonta Smith', 'A', 'Verified against https://www.heisman.com/about-the-heisman/milestones/'),
    ('medium', 'Who is the most recent player from a service academy to win the Heisman Trophy?', 'Pete Dawkins', 'Roger Staubach', 'Glenn Davis', 'Doc Blanchard', 'B', 'Verified against https://www.heisman.com/about-the-heisman/milestones/'),
    ('medium', 'Who became the first primarily defensive player to win the Heisman Trophy?', 'Ndamukong Suh', 'Hugh Green', 'Charles Woodson', 'Champ Bailey', 'C', 'Verified against https://www.heisman.com/about-the-heisman/milestones/'),
    ('medium', 'How many consecutive games did Oklahoma win during its record major-college streak?', '35', '40', '34', '47', 'D', 'Verified against https://www.ncaa.com/news/football/article/2018-11-02/longest-winning-streaks-college-football-history'),
    ('hard', 'Who was the first junior to win the Heisman Trophy?', 'Doc Blanchard', 'Bruce Smith', 'Jay Berwanger', 'Angelo Bertelli', 'A', 'Verified against https://www.heisman.com/about-the-heisman/milestones/'),
    ('hard', 'Who was the first West Coast player to win the Heisman Trophy?', 'O.J. Simpson', 'Terry Baker', 'Gary Beban', 'Marcus Allen', 'B', 'Verified against https://www.heisman.com/about-the-heisman/milestones/'),
    ('hard', 'Which Heisman winner also played in the NCAA basketball Final Four?', 'Bo Jackson', 'Charlie Ward', 'Terry Baker', 'Vic Janowicz', 'C', 'Verified against https://www.heisman.com/about-the-heisman/milestones/'),
    ('hard', 'Who is the youngest player ever to win the Heisman Trophy?', 'Johnny Manziel', 'Jameis Winston', 'Tim Tebow', 'Lamar Jackson', 'D', 'Verified against https://www.heisman.com/age-and-the-heisman/'),
    ('hard', 'Who is the oldest player ever to win the Heisman Trophy?', 'Chris Weinke', 'Brandon Weeden', 'Roger Staubach', 'Doug Flutie', 'A', 'Verified against https://www.heisman.com/age-and-the-heisman/'),
    ('hard', 'Whose Heisman announcement was the first broadcast live on television?', 'Herschel Walker', 'Marcus Allen', 'Bo Jackson', 'Earl Campbell', 'B', 'Verified against https://www.heisman.com/about-the-heisman/milestones/'),
    ('hard', 'Which teams played in the first televised college football game?', 'Rutgers and Princeton', 'Army and Navy', 'Fordham and Waynesburg', 'Harvard and Yale', 'C', 'Verified against https://www.ncaa.com/news/ncaa/article/2020-01-31/college-football-history-notable-firsts-and-milestones'),
    ('hard', 'Which matchup was the first college football game broadcast on radio?', 'Army vs. Navy', 'Rutgers vs. Princeton', 'Michigan vs. Ohio State', 'West Virginia vs. Pittsburgh', 'D', 'Verified against https://www.ncaa.com/news/ncaa/article/2020-01-31/college-football-history-notable-firsts-and-milestones'),
    ('hard', 'In which city were the first college football rules written?', 'Springfield, Massachusetts', 'New Brunswick, New Jersey', 'Cambridge, Massachusetts', 'New Haven, Connecticut', 'A', 'Verified against https://www.ncaa.com/news/ncaa/article/2020-01-31/college-football-history-notable-firsts-and-milestones'),
    ('hard', 'Which team ended Oklahoma''s record 47-game winning streak?', 'Texas', 'Notre Dame', 'Nebraska', 'USC', 'B', 'Verified against https://www.ncaa.com/news/football/article/2018-11-02/longest-winning-streaks-college-football-history')
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
    cfb_sport.id,
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
  from cfb_sport
  cross join question_seed
  where not exists (
    select 1
    from public.questions existing
    where existing.sport_id = cfb_sport.id
      and existing.question_text = question_seed.question_text
  )
  returning id
)
select count(*) from inserted_questions;
