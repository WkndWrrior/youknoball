with nba_sport as (
  insert into public.sports (slug, name, is_active, sort_order)
  values ('nba', 'NBA', true, 10)
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
    ('easy', 'LeBron James was born and raised in what Ohio city?', 'Akron', 'Cleveland', 'Columbus', 'Canton', 'A', 'Verified against https://www.basketball-reference.com/players/j/jamesle01.html'),
    ('easy', 'Who scored an NBA-record 37 points in one quarter while going 13-for-13 from the field?', 'Stephen Curry', 'Klay Thompson', 'Damian Lillard', 'Devin Booker', 'B', 'Verified against https://www.basketball-reference.com/boxscores/201501230GSW.html'),
    ('easy', 'Who is the NBA''s all-time regular-season scoring leader?', 'Kareem Abdul-Jabbar', 'Karl Malone', 'LeBron James', 'Michael Jordan', 'C', 'Verified against https://www.basketball-reference.com/leaders/pts_career.html'),
    ('easy', 'Which team won the 2024 NBA Finals?', 'Dallas Mavericks', 'Denver Nuggets', 'Miami Heat', 'Boston Celtics', 'D', 'Verified against https://www.basketball-reference.com/playoffs/2024-nba-finals-mavericks-vs-celtics.html'),
    ('easy', 'Stephen Curry has spent his NBA career with which franchise?', 'Golden State Warriors', 'Phoenix Suns', 'Charlotte Hornets', 'Sacramento Kings', 'A', 'Verified against https://www.basketball-reference.com/players/c/curryst01.html'),
    ('easy', 'Kobe Bryant spent his entire NBA career with which team?', 'Boston Celtics', 'Los Angeles Lakers', 'Chicago Bulls', 'Phoenix Suns', 'B', 'Verified against https://www.basketball-reference.com/players/b/bryanko01.html'),
    ('easy', 'Which NBA team drafted Tim Duncan first overall in 1997?', 'Boston Celtics', 'Philadelphia 76ers', 'San Antonio Spurs', 'Vancouver Grizzlies', 'C', 'Verified against https://www.basketball-reference.com/draft/NBA_1997.html'),
    ('easy', 'Which franchise did Michael Jordan win six NBA championships with?', 'Washington Wizards', 'Detroit Pistons', 'New York Knicks', 'Chicago Bulls', 'D', 'Verified against https://www.basketball-reference.com/players/j/jordami01.html'),
    ('easy', 'Which team drafted Magic Johnson first overall in 1979?', 'Los Angeles Lakers', 'Utah Jazz', 'Chicago Bulls', 'Kansas City Kings', 'A', 'Verified against https://www.basketball-reference.com/draft/NBA_1979.html'),
    ('easy', 'Which Denver Nuggets center won NBA MVP in 2021, 2022, and 2024?', 'Joel Embiid', 'Nikola Jokic', 'Giannis Antetokounmpo', 'Luka Doncic', 'B', 'Verified against https://www.basketball-reference.com/awards/mvp.html'),
    ('medium', 'Who was the first NBA Finals MVP in 1969?', 'Bill Russell', 'Wilt Chamberlain', 'Jerry West', 'Willis Reed', 'C', 'Verified against https://www.nba.com/news/history-finals-mvp'),
    ('medium', 'Who became the NBA''s first unanimous regular-season MVP in 2016?', 'LeBron James', 'Kevin Durant', 'James Harden', 'Stephen Curry', 'D', 'Verified against https://www.basketball-reference.com/awards/mvp.html'),
    ('medium', 'Which team overcame a 3-1 Finals deficit to win the 2016 NBA championship?', 'Cleveland Cavaliers', 'Golden State Warriors', 'Miami Heat', 'San Antonio Spurs', 'A', 'Verified against https://www.basketball-reference.com/playoffs/2016-nba-finals-cavaliers-vs-warriors.html'),
    ('medium', 'Who scored 100 points in an NBA game in 1962?', 'Elgin Baylor', 'Wilt Chamberlain', 'Oscar Robertson', 'Jerry West', 'B', 'Verified against https://www.basketball-reference.com/boxscores/196203020NYK.html'),
    ('medium', 'Which rookie won Finals MVP for the Lakers in 1980?', 'James Worthy', 'Kareem Abdul-Jabbar', 'Magic Johnson', 'Michael Cooper', 'C', 'Verified against https://www.nba.com/news/history-finals-mvp'),
    ('medium', 'Who won 11 NBA championships as a player with the Boston Celtics?', 'Sam Jones', 'John Havlicek', 'Bob Cousy', 'Bill Russell', 'D', 'Verified against https://www.basketball-reference.com/players/r/russebi01.html'),
    ('medium', 'Who led the Dallas Mavericks to the 2011 NBA title and won Finals MVP?', 'Dirk Nowitzki', 'Jason Kidd', 'Jason Terry', 'Shawn Marion', 'A', 'Verified against https://www.basketball-reference.com/playoffs/2011-nba-finals-mavericks-vs-heat.html'),
    ('medium', 'Who scored 50 points in the Bucks'' title-clinching Game 6 of the 2021 NBA Finals?', 'Khris Middleton', 'Giannis Antetokounmpo', 'Jrue Holiday', 'Devin Booker', 'B', 'Verified against https://www.basketball-reference.com/boxscores/202107200MIL.html'),
    ('medium', 'Which team won the 2004 NBA Finals over the heavily favored Lakers?', 'Indiana Pacers', 'New Jersey Nets', 'Detroit Pistons', 'San Antonio Spurs', 'C', 'Verified against https://www.basketball-reference.com/playoffs/2004-nba-finals-pistons-vs-lakers.html'),
    ('medium', 'Who was selected first overall in the 2003 NBA Draft?', 'Carmelo Anthony', 'Chris Bosh', 'Dwyane Wade', 'LeBron James', 'D', 'Verified against https://www.basketball-reference.com/draft/NBA_2003.html'),
    ('hard', 'Who is the NBA''s all-time regular-season assists leader?', 'John Stockton', 'Jason Kidd', 'Chris Paul', 'Steve Nash', 'A', 'Verified against https://www.basketball-reference.com/leaders/ast_career.html'),
    ('hard', 'Who is the NBA''s official all-time blocks leader?', 'Dikembe Mutombo', 'Hakeem Olajuwon', 'Kareem Abdul-Jabbar', 'David Robinson', 'B', 'Verified against https://www.basketball-reference.com/leaders/blk_career.html'),
    ('hard', 'Which player hit the 1989 playoff shot over Craig Ehlo?', 'Larry Bird', 'Magic Johnson', 'Michael Jordan', 'Reggie Miller', 'C', 'Verified against https://www.basketball-reference.com/boxscores/198905070CLE.html'),
    ('hard', 'Which Spurs guard won the 2007 NBA Finals MVP?', 'Manu Ginobili', 'Tim Duncan', 'Bruce Bowen', 'Tony Parker', 'D', 'Verified against https://www.nba.com/news/history-finals-mvp'),
    ('hard', 'Who won 2019 NBA Finals MVP with the Toronto Raptors?', 'Kawhi Leonard', 'Kyle Lowry', 'Pascal Siakam', 'Fred VanVleet', 'A', 'Verified against https://www.nba.com/news/history-finals-mvp'),
    ('hard', 'Which center was the first NBA MVP born outside the United States?', 'Nikola Jokic', 'Hakeem Olajuwon', 'Dirk Nowitzki', 'Giannis Antetokounmpo', 'B', 'Verified against https://www.basketball-reference.com/awards/mvp.html'),
    ('hard', 'Which eighth-seeded team upset the top-seeded Seattle SuperSonics in the 1994 playoffs?', 'New York Knicks', 'Atlanta Hawks', 'Denver Nuggets', 'Golden State Warriors', 'C', 'Verified against https://www.basketball-reference.com/playoffs/1994-nba-western-conference-first-round-nuggets-vs-supersonics.html'),
    ('hard', 'Who was named NBA Finals MVP in 1970 after the Knicks beat the Lakers?', 'Walt Frazier', 'Dave DeBusschere', 'Bill Bradley', 'Willis Reed', 'D', 'Verified against https://www.nba.com/news/history-finals-mvp'),
    ('hard', 'Which player owns the NBA single-game playoff scoring record with 63 points?', 'Michael Jordan', 'Elgin Baylor', 'Donovan Mitchell', 'Damian Lillard', 'A', 'Verified against https://www.basketball-reference.com/boxscores/198604200BOS.html'),
    ('hard', 'Who won the 1978 NBA Finals MVP for the Washington Bullets?', 'Elvin Hayes', 'Wes Unseld', 'Bob Dandridge', 'Phil Chenier', 'B', 'Verified against https://www.nba.com/news/history-finals-mvp')
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
    nba_sport.id,
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
  from nba_sport
  cross join question_seed
  where not exists (
    select 1
    from public.questions existing
    where existing.sport_id = nba_sport.id
      and existing.question_text = question_seed.question_text
  )
  returning id
)
select count(*) from inserted_questions;
