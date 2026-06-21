with nhl_sport as (
  insert into public.sports (slug, name, is_active, sort_order)
  values ('nhl', 'NHL', true, 50)
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
    ('easy', 'Who is the NHL''s all-time leader in career regular-season goals?', 'Alexander Ovechkin', 'Wayne Gretzky', 'Gordie Howe', 'Jaromir Jagr', 'A', 'Verified against https://www.hockey-reference.com/leaders/goals_career.html'),
    ('easy', 'Who is the NHL''s all-time regular-season points leader?', 'Mario Lemieux', 'Wayne Gretzky', 'Jaromir Jagr', 'Gordie Howe', 'B', 'Verified against https://www.hockey-reference.com/leaders/points_career.html'),
    ('easy', 'What trophy is awarded to the NHL playoff champion?', 'Hart Trophy', 'Vezina Trophy', 'Stanley Cup', 'Calder Trophy', 'C', 'Verified against https://www.hockey-reference.com/playoffs/'),
    ('easy', 'Which franchise has won the most Stanley Cups?', 'Toronto Maple Leafs', 'Detroit Red Wings', 'Boston Bruins', 'Montreal Canadiens', 'D', 'Verified against https://www.hockey-reference.com/playoffs/'),
    ('easy', 'Sidney Crosby has spent his NHL career with which team?', 'Pittsburgh Penguins', 'Philadelphia Flyers', 'Washington Capitals', 'New York Rangers', 'A', 'Verified against https://www.hockey-reference.com/players/c/crosbsi01.html'),
    ('easy', 'Connor McDavid was drafted first overall by which team?', 'Toronto Maple Leafs', 'Edmonton Oilers', 'Vancouver Canucks', 'Calgary Flames', 'B', 'Verified against https://www.hockey-reference.com/draft/NHL_2015_entry.html'),
    ('easy', 'How many periods are there in a regulation NHL game?', 'Two', 'Four', 'Three', 'Five', 'C', 'Verified against https://www.nhl.com/info/hockey-101'),
    ('easy', 'Which player is nicknamed The Great One?', 'Bobby Orr', 'Mario Lemieux', 'Sidney Crosby', 'Wayne Gretzky', 'D', 'Verified against https://www.hockey-reference.com/players/g/gretzwa01.html'),
    ('easy', 'Which goalie has the most wins in NHL regular-season history?', 'Martin Brodeur', 'Patrick Roy', 'Marc-Andre Fleury', 'Ed Belfour', 'A', 'Verified against https://www.hockey-reference.com/leaders/wins_goalie_career.html'),
    ('easy', 'Which team won the 2024 Stanley Cup Final?', 'Edmonton Oilers', 'Florida Panthers', 'Vegas Golden Knights', 'Colorado Avalanche', 'B', 'Verified against https://www.hockey-reference.com/playoffs/'),
    ('medium', 'Who holds the NHL single-season record with 92 goals?', 'Wayne Gretzky', 'Mario Lemieux', 'Brett Hull', 'Phil Esposito', 'A', 'Verified against https://www.hockey-reference.com/leaders/goals_season.html'),
    ('medium', 'Who holds the NHL single-season points record with 215?', 'Mario Lemieux', 'Wayne Gretzky', 'Steve Yzerman', 'Connor McDavid', 'B', 'Verified against https://www.hockey-reference.com/leaders/points_season.html'),
    ('medium', 'Who scored four goals in his NHL debut in 2016?', 'Connor McDavid', 'Patrik Laine', 'Auston Matthews', 'Jack Eichel', 'C', 'Verified against https://www.hockey-reference.com/boxscores/201610120OTT.html'),
    ('medium', 'Which franchise won its first Stanley Cup in 2023?', 'Florida Panthers', 'Seattle Kraken', 'Nashville Predators', 'Vegas Golden Knights', 'D', 'Verified against https://www.hockey-reference.com/playoffs/'),
    ('medium', 'Who won the 2024 Conn Smythe Trophy despite playing for the losing finalist?', 'Connor McDavid', 'Sergei Bobrovsky', 'Aleksander Barkov', 'Leon Draisaitl', 'A', 'Verified against https://www.hockey-reference.com/awards/connsm.html'),
    ('medium', 'Who is the NHL regular-season shutouts leader among goalies?', 'Terry Sawchuk', 'Martin Brodeur', 'Patrick Roy', 'George Hainsworth', 'B', 'Verified against https://www.hockey-reference.com/leaders/shutouts_goalie_career.html'),
    ('medium', 'Which team did Wayne Gretzky win four Stanley Cups with?', 'Los Angeles Kings', 'St. Louis Blues', 'Edmonton Oilers', 'New York Rangers', 'C', 'Verified against https://www.hockey-reference.com/players/g/gretzwa01.html'),
    ('medium', 'Who scored the famous flying goal to clinch the 1970 Stanley Cup for Boston?', 'Phil Esposito', 'Johnny Bucyk', 'Derek Sanderson', 'Bobby Orr', 'D', 'Verified against https://www.hockey-reference.com/playoffs/1970-boston-bruins-vs-st-louis-blues-stanley-cup-final.html'),
    ('medium', 'Which team ended a 54-year Stanley Cup drought in 1994?', 'New York Rangers', 'Vancouver Canucks', 'Montreal Canadiens', 'Toronto Maple Leafs', 'A', 'Verified against https://www.hockey-reference.com/playoffs/1994-new-york-rangers-vs-vancouver-canucks-stanley-cup-final.html'),
    ('medium', 'Who was the first NHL goalie credited with scoring a goal?', 'Ron Hextall', 'Billy Smith', 'Martin Brodeur', 'Chris Osgood', 'B', 'Verified against https://www.hockey-reference.com/players/s/smithbi01.html'),
    ('hard', 'Which goalie has the most playoff wins in NHL history?', 'Patrick Roy', 'Martin Brodeur', 'Marc-Andre Fleury', 'Grant Fuhr', 'A', 'Verified against https://www.hockey-reference.com/leaders/wins_goalie_career_p.html'),
    ('hard', 'Which defenseman won the Hart Trophy in 2000?', 'Nicklas Lidstrom', 'Chris Pronger', 'Ray Bourque', 'Scott Niedermayer', 'B', 'Verified against https://www.hockey-reference.com/awards/hart.html'),
    ('hard', 'Who scored the winning goal for Canada in Game 8 of the 1972 Summit Series?', 'Phil Esposito', 'Yvan Cournoyer', 'Paul Henderson', 'Bobby Clarke', 'C', 'Verified against https://www.hhof.com/htmlTimeCapsule/GamesSummarySUM1972.shtml'),
    ('hard', 'Which expansion team reached the Stanley Cup Final in its inaugural 2017-18 season?', 'Seattle Kraken', 'Minnesota Wild', 'Columbus Blue Jackets', 'Vegas Golden Knights', 'D', 'Verified against https://www.hockey-reference.com/playoffs/2018-vegas-golden-knights-vs-washington-capitals-stanley-cup-final.html'),
    ('hard', 'Who set the NHL rookie record with 76 goals in 1992-93?', 'Teemu Selanne', 'Alexander Ovechkin', 'Mike Bossy', 'Dino Ciccarelli', 'A', 'Verified against https://www.hockey-reference.com/players/s/selante01.html'),
    ('hard', 'Who scored the fastest hat trick in NHL history?', 'Maurice Richard', 'Bill Mosienko', 'Wayne Gretzky', 'Bobby Hull', 'B', 'Verified against https://www.nhl.com/news/nhl-fastest-hat-tricks-333538512'),
    ('hard', 'Who is the NHL''s all-time playoff goals leader?', 'Mark Messier', 'Brett Hull', 'Wayne Gretzky', 'Jari Kurri', 'C', 'Verified against https://www.hockey-reference.com/leaders/goals_career_p.html'),
    ('hard', 'Who was the first winner of the Conn Smythe Trophy in 1965?', 'Bobby Hull', 'Gordie Howe', 'Stan Mikita', 'Jean Beliveau', 'D', 'Verified against https://www.hockey-reference.com/awards/connsm.html'),
    ('hard', 'Who won the 2003 Conn Smythe Trophy while playing for the losing finalist?', 'Jean-Sebastien Giguere', 'Martin Brodeur', 'Scott Stevens', 'Paul Kariya', 'A', 'Verified against https://www.hockey-reference.com/awards/connsm.html'),
    ('hard', 'Who scored two goals for Colorado in Game 7 of the 2001 Stanley Cup Final?', 'Joe Sakic', 'Alex Tanguay', 'Peter Forsberg', 'Ray Bourque', 'B', 'Verified against https://www.hockey-reference.com/playoffs/2001-colorado-avalanche-vs-new-jersey-devils-stanley-cup-final.html')
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
    nhl_sport.id,
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
  from nhl_sport
  cross join question_seed
  where not exists (
    select 1
    from public.questions existing
    where existing.sport_id = nhl_sport.id
      and existing.question_text = question_seed.question_text
  )
  returning id
)
select count(*) from inserted_questions;
