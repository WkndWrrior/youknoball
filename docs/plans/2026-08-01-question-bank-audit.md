# Question Bank Audit

## Scope and result

The audit reviewed all 194 ready questions in the live snapshot: NBA 33, CBB 36, NFL 35, CFB 30, MLB 30, and NHL 30. It accepts 33 actions for migration `202608010003_question_bank_polish.sql`: 25 text-only rewrites, 6 rewrites or labels with difficulty changes, and 2 retirements. It rejects 1 agent proposal entirely and revises 2 accepted formulations after choice and duplicate review. The other 161 ready rows are unchanged by this migration, including the eight rows already assigned to migration `202608010002_question_review_updates.sql`.

Every accepted action was checked against its four answer choices. The protected Michael Jordan/Craig Ehlo row remains unchanged, as do all eight migration-002 rows and the retired UConn duplicate.

## NBA

### 535678e8-85db-4138-9285-b12facb06904

- Action: rewrite.
- Old: `When the banner-count debates start, which franchise sits atop NBA history for most championships?`
- New: `Which NBA franchise won 11 championships in 13 seasons from 1957 through 1969?`
- Difficulty: easy -> easy.
- Reason: replaces a mutable current leaderboard with Boston's stable dynasty record. The 11-in-13 span is fair against the Lakers, Warriors, Celtics, and Bulls and remains distinct from the existing question about the 2024 NBA Finals winner.
- Source: https://www.nba.com/celtics/news/sidebar/misc-20220105-sam-jones-was-winner-gentleman-and-mr-clutch

### 815c13f4-889a-4c17-a6b6-ec2c6c6a41c8

- Action: rewrite and difficulty change.
- Old: `Which player was nicknamed The Round Mound of Rebound?`
- New: `Which NBA star was nicknamed "The Round Mound of Rebound"?`
- Difficulty: hard -> easy.
- Reason: adds standalone league context and quotes the iconic nickname; recognizing Charles Barkley's signature moniker is an easy clue against these choices.
- Source: https://www.nba.com/news/history-nba-legend-charles-barkley

### f1b74737-81d6-48c8-a4e1-e62b688d0ff4

- Action: difficulty change.
- Old: `Who won 2019 NBA Finals MVP with the Toronto Raptors?`
- New: unchanged.
- Difficulty: hard -> medium.
- Reason: a recent Finals MVP identified by year and team is a clear medium-level fact against four players from that roster.
- Source: https://www.nba.com/news/history-finals-mvp-winners

### f971d39f-1d55-453d-848f-a19f174b368e

- Action: rewrite.
- Old: `Who is the NBA's all-time regular-season scoring leader?`
- New: `Who became the NBA's all-time regular-season scoring leader on February 7, 2023?`
- Difficulty: easy -> easy.
- Reason: anchors a mutable current-leader question to LeBron James's stable record-breaking date.
- Source: https://www.nba.com/news/lebron-james-sets-all-time-scoring-record-nba

### a3b3dcfb-ff7c-4c4f-a89a-1e4e0ad8cfd3

- Action: rewrite.
- Old: `Before the Chosen One headlines and NBA title runs, LeBron James grew up in what Ohio city?`
- New: `Before "The Chosen One" headlines and NBA title runs, LeBron James grew up in what Ohio city?`
- Difficulty: easy -> easy.
- Reason: preserves the familiar moniker and correctly places it in quotation marks without changing the clue.
- Source: https://www.nba.com/news/starting-5-dec-30-2024

## CBB

### 737b713f-b98c-44b7-b7d0-abe2577b4a09

- Action: rewrite retained canonical row.
- Old: `Which Big East school shocked Georgetown in the 1985 NCAA title game as an 8 seed?`
- New: `Which Big East school shocked Georgetown in the 1985 NCAA men's basketball title game as an 8 seed?`
- Difficulty: easy -> easy.
- Reason: adds the sport and tournament context needed for the canonical question to stand alone while preserving its No. 8-seed upset clue and all four choices.
- Source: https://www.ncaa.com/basketball-men/d1/villanova-college-basketball-championships-complete-history

### 7226d02d-c30b-4d9c-a43d-83ae81f5bde9

- Action: rewrite.
- Old: `Who led Houston over UCLA in the 1968 Game of the Century?`
- New: `Who scored 39 points to lead Houston past UCLA in college basketball's 1968 "Game of the Century"?`
- Difficulty: medium -> medium.
- Reason: names the sport, quotes the event moniker, and adds Elvin Hayes's verified scoring performance without favoring one player choice.
- Source: https://uhcougars.com/news/2023/2/10/general-transcendent-trailblazer-forever-cougar-elvin-hayes

### c6d8b26c-e08a-4c48-984b-59d67a790000

- Action: retire; text remains unchanged.
- Old: `In the 1985 NCAA title-game upset, Villanova defeated which defending champion?`
- New: unchanged; status becomes retired and both quiz eligibility flags become false.
- Difficulty: hard -> hard.
- Reason: near-duplicates ready row `737b713f-b98c-44b7-b7d0-abe2577b4a09`, whose canonical wording is `Which Big East school shocked Georgetown in the 1985 NCAA men's basketball title game as an 8 seed?` The retained row is the stronger version because it supplies the No. 8 seed and asks for the upset winner.
- Source: https://www.ncaa.com/basketball-men/d1/villanova-college-basketball-championships-complete-history

### b8889027-4618-45fd-a9b4-4ae44efd2398

- Action: factual rewrite.
- Old: `Which team beat Kentucky to win the 2012 national championship?`
- New: `Which team did Kentucky beat to win the 2012 NCAA men's basketball championship?`
- Difficulty: medium -> medium.
- Reason: corrects a factual reversal. Kentucky beat Kansas 67-59 in the 2012 NCAA men's championship game, so the old stem had no correct answer even though Kansas was keyed.
- Source: https://www.ncaa.com/news/basketball-men/article/2020-05-11/2012-ncaa-tournament-bracket-scores-stats-records

## NFL

### 5423a49d-d5d7-4872-9526-3cc035c16a07

- Action: rewrite.
- Old: `Before becoming Minnesota's star receiver, Justin Jefferson was drafted by which team in 2020?`
- New: `Which NFL team selected LSU receiver Justin Jefferson with the 22nd pick of the 2020 draft?`
- Difficulty: easy -> easy.
- Reason: removes `Minnesota`, which directly gives away the Vikings, and replaces it with fair draft context.
- Source: https://www.nfl.com/draft/tracker/2020/rounds/1

### 4a0c2441-2e3b-425a-8fb8-8ace8c037611

- Action: rewrite.
- Old: `Which franchise is nicknamed America's Team?`
- New: `Which NFL franchise is nicknamed "America's Team"?`
- Difficulty: easy -> easy.
- Reason: adds standalone NFL context and quotation marks around the established nickname.
- Source: https://www.nfl.com/news/packers-jaguars-among-america-s-team-candidates-after-boys-0ap3000000961379

### ae679d0a-6067-4646-8d5a-5eee965fad45

- Action: rewrite.
- Old: `Which quarterback led the Greatest Show on Turf Rams to victory in Super Bowl XXXIV (34)?`
- New: `Which quarterback led the "Greatest Show on Turf" Rams to victory in Super Bowl XXXIV (34)?`
- Difficulty: hard -> hard.
- Reason: quotes the established Rams moniker while preserving an already strong clue.
- Source: https://www.nfl.com/photos/greatest-show-on-turf-0ap2000000362117

### f395e563-5a9d-4489-87bd-b798e3171f10

- Action: rewrite.
- Old: `Who produced the Beast Quake touchdown run for Seattle in the 2010 playoffs?`
- New: `Who produced the "Beast Quake" touchdown run for Seattle in the 2010 playoffs?`
- Difficulty: medium -> medium.
- Reason: quotes the established play moniker without changing the clue burden.
- Source: https://www.seahawks.com/news/reliving-the-beast-quake-game-10-years-later

### c2aafb44-7663-4931-8384-b7c7ecabf099

- Action: rewrite.
- Old: `Which team beat Buffalo in the Wide Right game, Super Bowl XXV (25)?`
- New: `Which team beat Buffalo in the "Wide Right" game, Super Bowl XXV (25)?`
- Difficulty: hard -> hard.
- Reason: quotes the established game moniker and preserves the required Super Bowl format.
- Source: https://www.nfl.com/photos/super-bowl-memories-09000d5d82667042

### f210fcb0-e997-45d5-8e7b-bb9089baedd9

- Action: rewrite.
- Old: `Which Eagles quarterback caught the Philly Special touchdown in Super Bowl LII (52)?`
- New: `Which Eagles player caught the "Philly Special" touchdown in Super Bowl LII (52)?`
- Difficulty: medium -> medium.
- Reason: `quarterback` unfairly eliminates Zach Ertz and Trey Burton from the actual choices. `Player` restores all four choices while the quoted play name retains personality.
- Source: https://www.nfl.com/100/originals/100-greatest/detail.html?slug=plays-10

### d20244b4-13fb-4a33-acbb-2c7591d6d345

- Action: rewrite.
- Old: `Who scored the first touchdown in Super Bowl history?`
- New: `Who scored the first touchdown in Super Bowl I (1)?`
- Difficulty: hard -> hard.
- Reason: names the exact game and applies the Roman-numeral-plus-Arabic-number format without helping among the four Packers choices.
- Source: https://www.nfl.com/photos/max-mcgee-1932-2007-09000d5d80376fbb

### 3b21ecd5-4433-4459-9f56-18d7e1134c77

- Action: rewrite.
- Old: `The first Super Bowl belonged to which franchise?`
- New: `Which franchise won Super Bowl I (1)?`
- Difficulty: easy -> easy.
- Reason: replaces vague wording with a direct question and the required Super Bowl format.
- Source: https://www.nfl.com/photos/super-bowl-i-09000d5d8020f107

### 484c1b5c-5eab-46e9-8eb4-1395d8594482

- Action: rewrite.
- Old: `On the Giants' wild final drive in Super Bowl XLII (42), who came down with the Helmet Catch?`
- New: `On the Giants' wild final drive in Super Bowl XLII (42), who came down with the "Helmet Catch"?`
- Difficulty: medium -> medium.
- Reason: quotes the established play moniker while preserving the strong game and drive context.
- Source: https://www.nfl.com/100/originals/100-greatest/detail.html?slug=plays-3

## CFB

### bfcff20c-ae61-4188-a9a8-b2eb9fdcb5da

- Action: retire; text remains unchanged.
- Old: `Oklahoma's record major-college winning streak stopped at what number?`
- New: unchanged; status becomes retired and both quiz eligibility flags become false.
- Difficulty: medium -> medium.
- Reason: duplicates the same 47-game record tested by canonical migration-002 row `16e44025-d542-421e-b95e-5e787fed003c`. Retiring this reverse formulation preserves the stronger contextual question without editing the protected row.
- Source: https://www.ncaa.com/news/football/article/2018-11-02/longest-winning-streaks-college-football-history

### 98d47501-9167-4d9f-9f2b-7e69ad0005a0

- Action: rewrite.
- Old: `Johnny Football won the 2012 Heisman while playing for which school?`
- New: `"Johnny Football" won the 2012 Heisman while playing for which school?`
- Difficulty: easy -> easy.
- Reason: quotes the familiar moniker while preserving the concise clue.
- Source: https://www.heisman.com/articles/this-week-in-heisman-history-johnny-manziel-sets-sec-total-offense-mark-in-victory-over-arkansas/

### 051d193c-b8a1-4d2d-888b-631a9bcdc0da

- Action: rewrite.
- Old: `Which Heisman winner also took his Oregon State Beavers to the NCAA basketball Final Four?`
- New: `Which Heisman Trophy winner also played in the 1963 NCAA men's basketball Final Four?`
- Difficulty: hard -> hard.
- Reason: `Oregon State` identifies Terry Baker against the actual choices, and `took` overstates his role. The rewrite keeps the crossover achievement without the answer leak.
- Sources: https://www.heisman.com/heisman-winners/terry-baker/ and https://osubeavers.com/honors/hall-of-fame/terry--baker/154

## MLB

### 9e138209-3ae9-4ec2-bc15-0cfe16121edb

- Action: rewrite.
- Old: `Which Hall of Famer was nicknamed the Bambino and the Sultan of Swat?`
- New: `Which Baseball Hall of Famer was nicknamed "the Bambino" and "the Sultan of Swat"?`
- Difficulty: easy -> easy.
- Reason: adds standalone baseball context and quotes both established monikers.
- Source: https://baseballhall.org/hall-of-famers/ruth-babe

### 1f3f79a2-5e04-4c60-99f3-98005743442e

- Action: rewrite.
- Old: `Who won MLB's most recent batting Triple Crown in 2012?`
- New: `Who ended a 45-year drought by winning MLB's batting Triple Crown in 2012?`
- Difficulty: medium -> medium.
- Reason: replaces the mutable `most recent` framing with the stable 45-year gap before Miguel Cabrera's achievement.
- Source: https://www.mlb.com/news/a-look-at-baseball-triple-crown-winners

### 2702b046-3b1d-4b78-b557-d14301d30a6c

- Action: difficulty change.
- Old: `Who set MLB's consecutive games played record at 2,632?`
- New: unchanged.
- Difficulty: hard -> medium.
- Reason: Cal Ripken Jr.'s 2,632-game streak is a prominent record, and the exact total makes this clearly more accessible than the hard MLB questions.
- Source: https://baseballhall.org/hall-of-famers/ripken-cal

### 99038afd-d614-4788-9e2a-c866b755db0e

- Action: rewrite.
- Old: `Which team won the 1955 World Series for Brooklyn's first championship?`
- New: `Which franchise finally broke through for its first World Series championship in 1955?`
- Difficulty: medium -> medium.
- Reason: removes `Brooklyn`, which appears in the correct choice, without naming the Yankees and unfairly eliminating another choice. The first-title stakes remain the intended knowledge path.
- Source: https://www.mlb.com/postseason/history/1955

### 9aab2901-c4e4-469c-8ab7-7e58fd21a09f

- Action: difficulty change.
- Old: `Who holds MLB's single-season home run record with 73 in 2001?`
- New: unchanged.
- Difficulty: hard -> medium.
- Reason: Barry Bonds's 73-homer season is a prominent modern record, and both the total and year make it a clear medium clue.
- Source: https://www.mlb.com/news/mlb-single-season-home-run-record

### 9135ed53-9166-4d0b-92b4-e9349c6e6179

- Action: rewrite.
- Old: `Which former MLB franchise moved from Montreal to Washington before the 2005 season?`
- New: `Which MLB franchise relocated to Washington, D.C., and became the Nationals before the 2005 season?`
- Difficulty: medium -> medium.
- Reason: removes `Montreal`, which appears literally in the correct choice, and replaces it with destination, timing, and successor-franchise context.
- Source: https://www.mlb.com/nationals/history/timeline-2000s

### 96942dc2-29e1-4fa2-b08e-9f7118f299cc

- Action: difficulty change.
- Old: `Which club won the first modern World Series in 1903?`
- New: unchanged.
- Difficulty: easy -> medium.
- Reason: recognizing the winner under the period name `Boston Americans` requires historical MLB knowledge beyond easy difficulty.
- Source: https://www.mlb.com/news/first-world-series-appearance-for-every-mlb-team

### 9c4c6d5c-e401-4385-9dc0-f5e7081d6d72

- Action: rewrite.
- Old: `In the 1951 pennant race, who hit the Shot Heard Round the World?`
- New: `In the decisive Game 3 of the 1951 NL pennant tiebreaker, who hit the "Shot Heard Round the World"?`
- Difficulty: hard -> hard.
- Reason: supplies the league and decisive-game stakes and quotes the event moniker without identifying Bobby Thomson.
- Source: https://www.mlb.com/news/history-of-mlb-tiebreaker-games-c202246862

### 0ffd45c7-8d3e-49d4-bc7d-a525526c001b

- Action: rewrite.
- Old: `After the final out of the Fall Classic, what trophy goes to the World Series champion?`
- New: `After the final out of the "Fall Classic," what trophy goes to the World Series champion?`
- Difficulty: easy -> easy.
- Reason: quotes the World Series moniker while preserving an otherwise strong question.
- Source: https://www.mlb.com/glossary/miscellaneous/commissioners-trophy

## NHL

### f8a4a870-5132-4408-b2d1-99802c937754

- Action: rewrite.
- Old: `Who scored the fastest hat trick in NHL history?`
- New: `Who scored the fastest hat trick in NHL history, firing three goals in just 21 seconds?`
- Difficulty: hard -> hard.
- Reason: adds the verified 21-second scale of the record without favoring any player choice.
- Source: https://www.nhl.com/news/bill-mosienko-scores-fastest-hat-trick-in-nhl-history-290802314

### 4bed1358-a5dd-47b9-acbc-00b3eccbe57d

- Action: rewrite.
- Old: `After chasing Gretzky's mark for years, who now sits atop the NHL regular-season career goals list?`
- New: `Who broke Wayne Gretzky's NHL record of 894 regular-season goals in April 2025?`
- Difficulty: easy -> easy.
- Reason: anchors a mutable current-leader question to Alexander Ovechkin's stable record-breaking event.
- Source: https://www.nhl.com/news/alex-ovechkin-passes-wayne-gretzky-for-nhl-goals-record

### f4f00303-8bc9-47df-9ee4-3e1361583f71

- Action: difficulty change.
- Old: `Which expansion team crashed all the way into the Stanley Cup Final in its first season?`
- New: unchanged.
- Difficulty: hard -> medium.
- Reason: Vegas's inaugural-season Final run is a defining recent franchise fact, and the expansion-team choice set makes it a clear medium question.
- Source: https://www.nhl.com/news/golden-knights-magic-runs-out-in-stanley-cup-final-against-capitals-299000478

## Rejected or revised proposals

### 535678e8-85db-4138-9285-b12facb06904 (NBA)

- Revised proposal: the first audit proposed `Which franchise won its NBA-record 18th championship in 2024?`
- Decision: replace it with the accepted 11-championships-in-13-seasons clue above. The 2024 wording near-duplicates ready row `8aa148a0-b1ab-4abc-9f59-689dff6dd8e1`, which already asks which team won the 2024 NBA Finals.

### b6596b33-515c-45c2-b33b-fad95489a63a (NBA)

- Rejected proposal: replace `Who scored 100 points in an NBA game in 1962? (The cameras weren't on)` with a Hershey, Pennsylvania, record formulation and move medium -> easy.
- Decision: preserve the row unchanged. The parenthetical was an explicit product-owner wording choice, the proposed rewrite removes that voice, and the difficulty change is not necessary to fix an objective mismatch.

### 99038afd-d614-4788-9e2a-c866b755db0e (MLB)

- Revised proposal: the agent suggested `Which team beat the Yankees in seven games to win its first World Series championship in 1955?`
- Decision: keep the needed rewrite but remove `beat the Yankees`. Naming the Yankees would immediately eliminate one of the four answer choices. The accepted wording above removes the original `Brooklyn` leak without creating a new one.

## Protected exclusions

Migration 003 must not contain the eight migration-002 UUIDs: `101635c2-dbd2-4384-b954-a8e5bf9594c6`, `12a9ce1c-9b4b-4e15-a65f-1084b2f43c08`, `13724d84-8706-4948-a263-60971cf8158c`, `169f5245-60ed-46cb-9049-541cdd528d86`, `16e44025-d542-421e-b95e-5e787fed003c`, `1b866dd0-732e-4139-a468-8ed397768104`, `1e5f8ca2-2864-475e-a365-372071f0323c`, and `664e8135-bf10-4642-94fd-b4209a302c51`.

It must also exclude retired UConn UUID `14e2c0ff-1cc2-4b0d-9b32-801acfa77883` and Michael Jordan/Craig Ehlo UUID `0905e82a-abcb-4861-84cc-8e3e0509d079`, preserving `In Game 5 of the 1989 Eastern Conference first round, which player hit the wonderful series-winning shot over Craig Ehlo?` unchanged.
