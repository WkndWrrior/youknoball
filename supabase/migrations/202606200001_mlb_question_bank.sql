with mlb_sport as (
  insert into public.sports (slug, name, is_active, sort_order)
  values ('mlb', 'MLB', true, 60)
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
    ('easy', 'Which team won the 2016 World Series?', 'Chicago Cubs', 'Cleveland Indians', 'New York Yankees', 'Los Angeles Dodgers', 'A', 'Verified against https://www.mlb.com/world-series/history/winners'),
    ('easy', 'Which Hall of Famer was nicknamed the Bambino and the Sultan of Swat?', 'Lou Gehrig', 'Babe Ruth', 'Ted Williams', 'Mickey Mantle', 'B', 'Verified against https://baseballhall.org/hall-of-famers/ruth-babe'),
    ('easy', 'Jackie Robinson made his 1947 National League debut with which team?', 'New York Giants', 'Boston Braves', 'Brooklyn Dodgers', 'St. Louis Cardinals', 'C', 'Verified against https://baseballhall.org/hall-of-famers/robinson-jackie'),
    ('easy', 'Which franchise has won a record 27 World Series championships?', 'Boston Red Sox', 'St. Louis Cardinals', 'Los Angeles Dodgers', 'New York Yankees', 'D', 'Verified against https://www.mlb.com/news/mlb-teams-with-most-world-series-titles'),
    ('easy', 'Which team won the 2023 World Series?', 'Texas Rangers', 'Arizona Diamondbacks', 'Houston Astros', 'Atlanta Braves', 'A', 'Verified against https://www.mlb.com/world-series/history/winners'),
    ('easy', 'Which team plays its home games at Fenway Park?', 'Chicago Cubs', 'Boston Red Sox', 'New York Mets', 'Detroit Tigers', 'B', 'Verified against https://www.mlb.com/redsox/ballpark'),
    ('easy', 'How many outs are there in a standard half-inning?', 'One', 'Two', 'Three', 'Four', 'C', 'Verified against https://www.mlb.com/glossary/rules/inning'),
    ('easy', 'Which club won the first modern World Series in 1903?', 'Pittsburgh Pirates', 'New York Giants', 'Philadelphia Athletics', 'Boston Americans', 'D', 'Verified against https://www.mlb.com/world-series/history/winners'),
    ('easy', 'Who holds MLB''s career home run record with 762?', 'Barry Bonds', 'Hank Aaron', 'Babe Ruth', 'Albert Pujols', 'A', 'Verified against https://www.baseball-reference.com/leaders/HR_career.shtml'),
    ('easy', 'What trophy is awarded to the World Series champion?', 'Cy Young Award', 'Commissioner''s Trophy', 'Roberto Clemente Award', 'Hank Aaron Award', 'B', 'Verified against https://www.mlb.com/glossary/miscellaneous/commissioners-trophy'),
    ('medium', 'Who holds MLB''s career hits record with 4,256?', 'Derek Jeter', 'Ty Cobb', 'Pete Rose', 'Hank Aaron', 'C', 'Verified against https://www.baseball-reference.com/leaders/H_career.shtml'),
    ('medium', 'Who holds MLB''s career strikeouts record by a pitcher with 5,714?', 'Roger Clemens', 'Randy Johnson', 'Steve Carlton', 'Nolan Ryan', 'D', 'Verified against https://www.baseball-reference.com/leaders/SO_p_career.shtml'),
    ('medium', 'Who holds MLB''s career stolen bases record with 1,406?', 'Rickey Henderson', 'Lou Brock', 'Billy Hamilton', 'Ty Cobb', 'A', 'Verified against https://www.baseball-reference.com/leaders/SB_career.shtml'),
    ('medium', 'Who threw the only perfect game in World Series history?', 'Roy Halladay', 'Don Larsen', 'Sandy Koufax', 'David Cone', 'B', 'Verified against https://sabr.org/gamesproj/game/october-8-1956-don-larsen-throws-a-perfect-game-in-the-world-series/'),
    ('medium', 'Who became the first player unanimously elected to the Baseball Hall of Fame?', 'Ken Griffey Jr.', 'Derek Jeter', 'Mariano Rivera', 'Cal Ripken Jr.', 'C', 'Verified against https://baseballhall.org/hall-of-famers/rivera-mariano'),
    ('medium', 'Which former MLB franchise moved from Montreal to Washington before the 2005 season?', 'Washington Senators', 'Kansas City Athletics', 'Seattle Pilots', 'Montreal Expos', 'D', 'Verified against https://www.mlb.com/nationals/history/timeline'),
    ('medium', 'Which team tied the MLB single-season record with 116 wins in 2001?', 'Seattle Mariners', 'New York Yankees', 'Atlanta Braves', 'Oakland Athletics', 'A', 'Verified against https://www.mlb.com/news/most-regular-season-wins-in-mlb-history'),
    ('medium', 'Who was the first Black player in the American League in the modern era?', 'Jackie Robinson', 'Larry Doby', 'Satchel Paige', 'Monte Irvin', 'B', 'Verified against https://baseballhall.org/hall-of-famers/doby-larry'),
    ('medium', 'Who won MLB''s most recent batting Triple Crown in 2012?', 'Albert Pujols', 'Mike Trout', 'Miguel Cabrera', 'Joey Votto', 'C', 'Verified against https://www.mlb.com/news/miguel-cabrera-triple-crown-10th-anniversary'),
    ('medium', 'Which team won the 1955 World Series for Brooklyn''s first championship?', 'New York Yankees', 'New York Giants', 'Milwaukee Braves', 'Brooklyn Dodgers', 'D', 'Verified against https://www.baseball-reference.com/postseason/1955_WS.shtml'),
    ('hard', 'Which player was the first to reach both 500 home runs and 3,000 hits?', 'Hank Aaron', 'Willie Mays', 'Eddie Murray', 'Alex Rodriguez', 'A', 'Verified against https://baseballhall.org/hall-of-famers/aaron-hank'),
    ('hard', 'Who holds MLB''s single-season saves record with 62 saves in 2008?', 'Mariano Rivera', 'Francisco Rodriguez', 'Edwin Diaz', 'Trevor Hoffman', 'B', 'Verified against https://www.baseball-reference.com/leaders/SV_season.shtml'),
    ('hard', 'Who holds MLB''s career triples record with 309?', 'Ty Cobb', 'Honus Wagner', 'Sam Crawford', 'Tris Speaker', 'C', 'Verified against https://www.baseball-reference.com/leaders/3B_career.shtml'),
    ('hard', 'Who set the modern MLB single-season stolen bases record with 130 in 1982?', 'Vince Coleman', 'Lou Brock', 'Tim Raines', 'Rickey Henderson', 'D', 'Verified against https://www.baseball-reference.com/leaders/SB_season.shtml'),
    ('hard', 'Who holds MLB''s single-season home run record with 73 in 2001?', 'Mark McGwire', 'Barry Bonds', 'Sammy Sosa', 'Aaron Judge', 'B', 'Verified against https://www.baseball-reference.com/leaders/HR_season.shtml'),
    ('hard', 'Who hit the 1951 Shot Heard Round the World?', 'Willie Mays', 'Bobby Thomson', 'Duke Snider', 'Gil Hodges', 'B', 'Verified against https://sabr.org/gamesproj/game/october-3-1951-the-shot-heard-round-the-world-bobby-thomson-wins-the-pennant-for-giants/'),
    ('hard', 'Who was the first World Series MVP after the award debuted in 1955?', 'Sandy Koufax', 'Roy Campanella', 'Johnny Podres', 'Don Newcombe', 'C', 'Verified against https://www.baseball-reference.com/postseason/1955_WS.shtml'),
    ('hard', 'Who set MLB''s consecutive games played record at 2,632?', 'Lou Gehrig', 'Pete Rose', 'Eddie Murray', 'Cal Ripken Jr.', 'D', 'Verified against https://baseballhall.org/hall-of-famers/ripken-cal'),
    ('hard', 'Who holds MLB''s career grand slam record with 25?', 'Alex Rodriguez', 'Lou Gehrig', 'Manny Ramirez', 'Eddie Murray', 'A', 'Verified against https://www.mlb.com/news/most-career-grand-slams-in-mlb-history'),
    ('hard', 'Which dominant Yankees closer allowed only 11 earned runs across his postseason career?', 'Mariano Rivera', 'Trevor Hoffman', 'Dennis Eckersley', 'Goose Gossage', 'A', 'Verified against https://www.baseball-reference.com/players/r/riverma01.shtml')
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
    mlb_sport.id,
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
  from mlb_sport
  cross join question_seed
  where not exists (
    select 1
    from public.questions existing
    where existing.sport_id = mlb_sport.id
      and existing.question_text = question_seed.question_text
  )
  returning id
)
select count(*) from inserted_questions;
