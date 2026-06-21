with cbb_sport as (
  insert into public.sports (slug, name, is_active, sort_order)
  values ('cbb', 'CBB', true, 20)
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
    ('easy', 'Which program has won the most NCAA Division I men''s basketball championships?', 'UCLA', 'Kentucky', 'Duke', 'North Carolina', 'A', 'Verified against https://www.ncaa.com/history/basketball-men/d1'),
    ('easy', 'Mike Krzyzewski became a coaching legend at which school?', 'Kansas', 'Duke', 'Indiana', 'Villanova', 'B', 'Verified against https://www.sports-reference.com/cbb/coaches/mike-krzyzewski-1.html'),
    ('easy', 'Which school won the 2024 NCAA men''s basketball championship?', 'Purdue', 'Alabama', 'UConn', 'Houston', 'C', 'Verified against https://www.ncaa.com/history/basketball-men/d1'),
    ('easy', 'Which team did North Carolina defeat in the 1982 national championship game?', 'Georgetown', 'Houston', 'Louisville', 'Virginia', 'A', 'Verified against https://www.sports-reference.com/cbb/postseason/men/1982-ncaa.html'),
    ('easy', 'Who is the all-time leading scorer in Division I men''s basketball?', 'Oscar Robertson', 'Pete Maravich', 'Freeman Williams', 'Chris Clemons', 'B', 'Verified against https://www.sports-reference.com/cbb/leaders/men/pts-player-career.html'),
    ('easy', 'Which school won back-to-back men''s national titles in 2006 and 2007?', 'Duke', 'Kansas', 'Florida', 'UConn', 'C', 'Verified against https://www.ncaa.com/history/basketball-men/d1'),
    ('easy', 'Which school won the 2023 NCAA men''s basketball championship?', 'San Diego State', 'Miami', 'Florida Atlantic', 'UConn', 'D', 'Verified against https://www.ncaa.com/history/basketball-men/d1'),
    ('easy', 'Which school did Carmelo Anthony lead to the 2003 national title?', 'Syracuse', 'Kansas', 'Texas', 'Marquette', 'A', 'Verified against https://www.sports-reference.com/cbb/postseason/men/2003-ncaa.html'),
    ('easy', 'Which team became the first 16 seed to beat a 1 seed in the men''s NCAA tournament?', 'Fairleigh Dickinson', 'UMBC', 'Princeton', 'Richmond', 'B', 'Verified against https://www.ncaa.com/news/basketball-men/article/2018-03-17/umbc-upsets-virginia-first-16-seed-beat-1-seed-ncaa'),
    ('easy', 'Which Big East school won the 1985 national championship as an 8 seed?', 'Georgetown', 'St. John''s', 'Villanova', 'Syracuse', 'C', 'Verified against https://www.sports-reference.com/cbb/postseason/men/1985-ncaa.html'),
    ('medium', 'In the 2015 Final Four, Kentucky entered 38-0 before losing to which 1 seed?', 'Duke', 'Arizona', 'Michigan State', 'Wisconsin', 'D', 'Verified against https://www.sports-reference.com/cbb/postseason/men/2015-ncaa.html'),
    ('medium', 'Which school won the first NCAA men''s basketball tournament in 1939?', 'Oregon', 'Ohio State', 'Oklahoma', 'Villanova', 'A', 'Verified against https://www.ncaa.com/history/basketball-men/d1'),
    ('medium', 'Which team beat Kentucky to win the 2012 national championship?', 'Louisville', 'Kansas', 'Ohio State', 'Baylor', 'B', 'Verified against https://www.sports-reference.com/cbb/postseason/men/2012-ncaa.html'),
    ('medium', 'Who hit the game-winning shot for NC State in the 1983 national championship game?', 'Dereck Whittenburg', 'Thurl Bailey', 'Lorenzo Charles', 'Sidney Lowe', 'C', 'Verified against https://www.sports-reference.com/cbb/postseason/men/1983-ncaa.html'),
    ('medium', 'Which school won the 1966 national title with a historic all-Black starting lineup?', 'UCLA', 'Kentucky', 'Duke', 'Texas Western', 'D', 'Verified against https://www.ncaa.com/history/basketball-men/d1'),
    ('medium', 'Who led Houston over UCLA in the 1968 Game of the Century?', 'Elvin Hayes', 'Don Chaney', 'Lew Alcindor', 'Calvin Murphy', 'A', 'Verified against https://www.sports-reference.com/cbb/boxscores/1968-01-20-houston.html'),
    ('medium', 'Which coach won 10 NCAA men''s basketball national championships at UCLA?', 'Adolph Rupp', 'John Wooden', 'Dean Smith', 'Bob Knight', 'B', 'Verified against https://www.sports-reference.com/cbb/coaches/john-wooden-1.html'),
    ('medium', 'Which school ended UCLA''s 88-game winning streak in 1974?', 'NC State', 'Maryland', 'Notre Dame', 'Marquette', 'C', 'Verified against https://www.sports-reference.com/cbb/boxscores/1974-01-19-notre-dame.html'),
    ('medium', 'Who hit Duke''s famous 1992 East Regional final shot against Kentucky?', 'Grant Hill', 'Bobby Hurley', 'Thomas Hill', 'Christian Laettner', 'D', 'Verified against https://www.sports-reference.com/cbb/boxscores/1992-03-28-duke.html'),
    ('medium', 'Which school won the 2008 national title over Memphis in overtime?', 'Kansas', 'North Carolina', 'UCLA', 'Texas', 'A', 'Verified against https://www.sports-reference.com/cbb/postseason/men/2008-ncaa.html'),
    ('hard', 'Before the 1965-66 season, which future NBA star led the UCLA freshman team past the two-time defending champion UCLA varsity team?', 'Kareem Abdul-Jabbar', 'Bill Walton', 'Jamaal Wilkes', 'Gail Goodrich', 'A', 'Verified against https://www.sports-reference.com/cbb/schools/ucla/1966.html'),
    ('hard', 'Which school won both the NCAA tournament and NIT in 1950?', 'Bradley', 'CCNY', 'Kentucky', 'La Salle', 'B', 'Verified against https://www.ncaa.com/history/basketball-men/d1 and https://www.sports-reference.com/cbb/postseason/men/1950-ncaa.html'),
    ('hard', 'Who scored a record 184 points in the 1989 NCAA tournament?', 'Glen Rice', 'Danny Manning', 'Sean Elliott', 'Pervis Ellison', 'A', 'Verified against https://www.sports-reference.com/cbb/postseason/men/1989-ncaa.html'),
    ('hard', 'Which UCLA star shot 21-for-22 from the field in the 1973 national championship game?', 'Kareem Abdul-Jabbar', 'David Thompson', 'Bill Walton', 'Keith Wilkes', 'C', 'Verified against https://www.sports-reference.com/cbb/boxscores/1973-03-26-memphis.html'),
    ('hard', 'Which team beat UCLA in the 1974 national semifinals before winning the title?', 'Kansas', 'Marquette', 'Indiana', 'NC State', 'D', 'Verified against https://www.sports-reference.com/cbb/postseason/men/1974-ncaa.html'),
    ('hard', 'Which school did Danny Manning lead to the 1988 national championship?', 'Kansas', 'Oklahoma', 'Duke', 'Arizona', 'A', 'Verified against https://www.sports-reference.com/cbb/postseason/men/1988-ncaa.html'),
    ('hard', 'Who was named Most Outstanding Player of the 1979 NCAA tournament?', 'Magic Johnson', 'Larry Bird', 'Greg Kelser', 'Sidney Moncrief', 'A', 'Verified against https://www.sports-reference.com/cbb/postseason/men/1979-ncaa.html'),
    ('hard', 'Which school won the 1997 national title behind freshman Mike Bibby?', 'Kentucky', 'Arizona', 'North Carolina', 'Minnesota', 'B', 'Verified against https://www.sports-reference.com/cbb/postseason/men/1997-ncaa.html'),
    ('hard', 'Which school won the 1986 national title with freshman Pervis Ellison?', 'Duke', 'Kansas', 'Louisville', 'Michigan', 'C', 'Verified against https://www.sports-reference.com/cbb/postseason/men/1986-ncaa.html'),
    ('hard', 'Which program won the 1990 national title under coach Jerry Tarkanian?', 'Duke', 'Arkansas', 'Georgetown', 'UNLV', 'D', 'Verified against https://www.sports-reference.com/cbb/postseason/men/1990-ncaa.html')
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
    cbb_sport.id,
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
  from cbb_sport
  cross join question_seed
  where not exists (
    select 1
    from public.questions existing
    where existing.sport_id = cbb_sport.id
      and existing.question_text = question_seed.question_text
  )
  returning id
)
select count(*) from inserted_questions;
