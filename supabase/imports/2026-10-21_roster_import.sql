-- FILE: supabase/imports/2026-10-21_roster_import.sql
--
-- STEP 2 of 2: IMPORT. Run the preview first and look it over.
--
-- Club roster of Oct 21, 2026 (ClubwideRoster_Vortex_2026-10-21.xls) into the
-- Vortex weight room app. VORTEX SUPABASE PROJECT ONLY, never Bruisers Lacrosse.
--
--   Teams     20 of the 27 roster teams. Left out: the 12s and the local
--             teams (Whitney, Jesse, Ella, Eric, Chris). Teams already in the app
--             are kept (same team, same history) and renamed to the roster form,
--             e.g. "16 Pallavolo" / age group "16s", "18 Storm Boys" / "Boys 18s".
--   Players   matched to players already in the app first, so nobody is added
--             twice: same name, then same birthday + last name, then close
--             names (Abby / Abigail). Matches that aren't exact are listed under
--             "CHECK THESE MATCHES". Only players not found are added, PIN 1234.
--             A player on a roster team in the app but not on its roster is
--             taken off that team (the account and workout history stay).
--   Coaches   one team coach account each (role coach, not admin), named
--             "Coach First Last", PIN 9876, linked to their team(s). Steve is
--             skipped (he has the Admin account).
--
-- How to run: Supabase → Vortex project → SQL Editor → New query → paste this
-- whole file → Run.
--   1. 2026-10-21_roster_preview.sql   changes NOTHING; lists what would happen
--   2. 2026-10-21_roster_import.sql    makes the changes, then lists what it did
-- Both are safe to run again: a second run finds everyone and changes nothing.

begin;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. The roster (from ClubwideRoster_Vortex_2026-10-21.xls)
-- ─────────────────────────────────────────────────────────────────────────
set client_min_messages = warning;
drop table if exists pg_temp._rt, pg_temp._rp, pg_temp._rc, pg_temp._p, pg_temp._cur, pg_temp._tcand,
  pg_temp._tm, pg_temp._rpx, pg_temp._pm, pg_temp._new, pg_temp._cm;

create or replace function pg_temp.norm(t text) returns text language sql immutable as $f$
  select regexp_replace(
    translate(lower(coalesce(t, '')), 'áàâäãåéèêëíìîïóòôöõúùûüñçý', 'aaaaaaeeeeiiiiooooouuuuncy'),
    '[^a-z0-9]', '', 'g')
$f$;

-- Teams. include = false: 12s and local teams (Whitney, Jesse, Ella, Eric, Chris)
create temp table _rt (key int primary key, age int, nick text, name text, age_group text,
                       is_boys boolean, include boolean, left_out_because text, roster_coaches text);
insert into _rt values
(1, 12, 'Lightning', '12 Lightning', '12s', false, false, 'under 13', 'Conleigh Brock'),
(2, 12, 'Typhoon', '12 Typhoon', '12s', false, false, 'under 13', 'Amanda Spence'),
(3, 12, 'Ninjas', '12 Ninjas', '12s', false, false, 'local team', 'Whitney Blaylock'),
(4, 13, 'Raptors', '13 Raptors', '13s', false, true, null, 'Andria Dobson'),
(5, 13, 'Cyclone', '13 Cyclone', '13s', false, true, null, 'Bailey Chapman'),
(6, 13, 'Revival', '13 Revival', '13s', false, false, 'local team', 'Ella Finnell'),
(7, 13, 'Bellatrix', '13 Bellatrix', '13s', false, false, 'local team', 'Jesse Parsons'),
(8, 14, 'Intensity', '14 Intensity', '14s', false, true, null, 'Austin Bryant'),
(9, 14, 'Alpha', '14 Alpha', '14s', false, true, null, 'Sarah Bass'),
(10, 14, 'Fury', '14 Fury', '14s', false, true, null, 'Ragen Dobson'),
(11, 14, 'Eclipse', '14 Eclipse', '14s', false, true, null, 'Ivy Kimmerling'),
(12, 14, 'Valor', '14 Valor', '14s', false, false, 'local team', 'Eric Bennett'),
(13, 15, 'Ares', '15 Ares', '15s', false, true, null, 'Nick Tovar'),
(14, 15, 'Thunder', '15 Thunder', '15s', false, true, null, 'Serena Bird'),
(15, 15, 'Surge', '15 Surge', '15s', false, true, null, 'Emma Carter, Shannon Carter'),
(16, 15, 'Valkyries', '15 Valkyries', '15s', false, true, null, 'Skylar Kimmerling'),
(17, 15, 'Attack', '15 Attack', '15s', false, false, 'local team', 'Christopher Sterl'),
(18, 16, 'Pallavolo', '16 Pallavolo', '16s', false, true, null, 'Alfie Dodd'),
(19, 16, 'Americana', '16 Americana', '16s', false, true, null, 'Phillip Finnell'),
(20, 16, 'Legacy', '16 Legacy', '16s', false, true, null, 'Caitlyn Lambitz'),
(21, 17, 'Gladiators', '17 Gladiators', '17s', false, true, null, 'Jackson Lenoir'),
(22, 17, 'Hurricane', '17 Hurricane', '17s', false, true, null, 'Michael DeMeo'),
(23, 17, 'Prime', '17 Prime', '17s', false, true, null, 'Lauren Cox'),
(24, 18, 'Venom', '18 Venom', '18s', false, true, null, 'Marjorie Smith'),
(25, 18, 'Nova', '18 Nova', '18s', false, true, null, 'Emma Haddix'),
(26, 18, 'Storm', '18 Storm Boys', 'Boys 18s', true, true, null, 'Steven Lohn, Ted Hackett'),
(27, 18, 'Havoc', '18 Havoc Boys', 'Boys 18s', true, true, null, 'Ted Hackett, Steven Lohn');

-- Players on the included teams
create temp table _rp (rid int primary key, team_key int, first text, last text, jersey text, dob date);
insert into _rp values
(1, 4, 'Luci', 'Hill', '1', '2014-07-21'::date),
(2, 4, 'Riley', 'Krumrie', '41', '2014-08-14'::date),
(3, 4, 'Ellie', 'Lewis', '23', '2013-08-13'::date),
(4, 4, 'Charlotte', 'Pohlman', '17', '2014-10-03'::date),
(5, 4, 'Emily', 'Reel', '2', '2013-12-09'::date),
(6, 4, 'Paisley', 'Rogers', '27', '2014-02-09'::date),
(7, 4, 'Sadie', 'Swanson', '14', '2014-02-16'::date),
(8, 4, 'London', 'Whitaker', '12', '2013-08-12'::date),
(9, 5, 'Madison', 'Chanslor', '9', '2013-07-26'::date),
(10, 5, 'Ava', 'Crye', '8', '2013-10-31'::date),
(11, 5, 'Elliana', 'Elrod', '24', '2013-07-31'::date),
(12, 5, 'Kenzlee', 'Fair', '1', '2014-01-06'::date),
(13, 5, 'Ryleigh', 'Fitzgerald', '21', '2013-10-29'::date),
(14, 5, 'Amelia', 'Flowers', '6', '2014-02-20'::date),
(15, 5, 'Scarlett', 'Hixon', '10', '2014-06-18'::date),
(16, 5, 'Maleyah', 'Love', '3', '2014-01-05'::date),
(17, 5, 'Harper', 'Murray', '13', '2013-08-30'::date),
(18, 5, 'Alianah', 'Pledger', '25', '2013-10-01'::date),
(19, 5, 'Lola', 'Shaw', '17', '2014-06-05'::date),
(20, 8, 'Emory', 'Baker', '20', '2012-10-20'::date),
(21, 8, 'Janie', 'Browning', '21', '2013-12-06'::date),
(22, 8, 'Rowen', 'Coalwell', '4', '2012-09-14'::date),
(23, 8, 'Paisley', 'Cuttitta', '25', '2013-02-25'::date),
(24, 8, 'Hannah', 'Hall', '24', '2012-09-19'::date),
(25, 8, 'Charlotte', 'Scorey', '99', '2012-08-29'::date),
(26, 8, 'Marlee', 'Spence', '5', '2013-06-26'::date),
(27, 8, 'Cameron', 'Trent', '7', '2012-07-30'::date),
(28, 8, 'Nola', 'Ware', '22', '2012-11-28'::date),
(29, 8, 'Ellie', 'Whitmer', '11', '2013-02-04'::date),
(30, 9, 'Channing', 'Borski', '3', '2012-07-06'::date),
(31, 9, 'Caelyn', 'Bullard', '12', '2012-08-30'::date),
(32, 9, 'Meryl', 'Donovan', '4', '2012-07-25'::date),
(33, 9, 'Lauren', 'Holt', '23', '2013-08-18'::date),
(34, 9, 'Zoe', 'Mathai', '7', '2012-12-17'::date),
(35, 9, 'Ryann', 'McMillan', '77', '2012-08-10'::date),
(36, 9, 'Sadie', 'Newton', '10', '2013-08-28'::date),
(37, 9, 'Abigail', 'Poland', '24', '2013-04-05'::date),
(38, 9, 'Reagan', 'Stephenson', '8', '2014-07-02'::date),
(39, 10, 'Kelley', 'Belue', '11', '2013-02-27'::date),
(40, 10, 'Annie', 'Chen', '10', '2013-01-19'::date),
(41, 10, 'Shiyan', 'Fu', '3', '2013-03-14'::date),
(42, 10, 'Kellee', 'Hobbs', '2', '2013-01-12'::date),
(43, 10, 'Kraigyn', 'McCord', '7', '2013-03-15'::date),
(44, 10, 'Sophia', 'Simon', '16', '2012-10-01'::date),
(45, 10, 'Makinley', 'Smith', '5', '2013-03-08'::date),
(46, 10, 'Lyla', 'Womack', '21', '2013-03-05'::date),
(47, 11, 'Ainsley', 'Frost', '12', '2012-10-12'::date),
(48, 11, 'Emily', 'Johnson', '31', '2012-11-19'::date),
(49, 11, 'Madelyn', 'Maddux', '4', '2012-10-23'::date),
(50, 11, 'Ryleigh', 'McElvain', '17', '2013-05-28'::date),
(51, 11, 'Leeya', 'Mehtar', '11', '2013-05-16'::date),
(52, 11, 'Reagan', 'Roberts', '5', '2012-07-25'::date),
(53, 13, 'Faithann', 'Adams', '6', '2012-03-10'::date),
(54, 13, 'Alayna', 'Blaylock', '4', '2012-04-13'::date),
(55, 13, 'Emma', 'Browning', '21', '2012-02-16'::date),
(56, 13, 'Chloe', 'Hackett', '14', '2011-12-21'::date),
(57, 13, 'Alexis', 'Houck', '23', '2012-01-06'::date),
(58, 13, 'Isabelle', 'Peek', '17', '2012-06-26'::date),
(59, 13, 'Hallie', 'Smith', '16', '2012-06-13'::date),
(60, 13, 'London', 'Stone', '37', '2012-03-20'::date),
(61, 13, 'Norah', 'Stubblefield', '7', '2011-10-26'::date),
(62, 13, 'Aubree', 'Wilson', '11', '2011-09-24'::date),
(63, 14, 'Briley', 'Anderson', '2', '2012-03-06'::date),
(64, 14, 'Emma', 'Cottle', '15', '2012-12-17'::date),
(65, 14, 'Zoey', 'Flannigan', '14', '2012-04-12'::date),
(66, 14, 'Emmalinn', 'Kibble', '12', '2011-08-26'::date),
(67, 14, 'Ansley', 'McAfee', '22', '2012-03-17'::date),
(68, 14, 'Chloe', 'McCuiston', '3', '2012-02-29'::date),
(69, 14, 'Bella', 'Montieth', '11', '2012-03-29'::date),
(70, 14, 'Kinslee', 'Newport', '13', '2012-04-24'::date),
(71, 14, 'Allie', 'Skiles', '4', '2011-08-04'::date),
(72, 14, 'Stella', 'Slatton', '27', '2011-11-07'::date),
(73, 15, 'Evie', 'Blankenship', '12', '2012-01-28'::date),
(74, 15, 'Angel', 'Glass-Brewster', '24', '2011-09-08'::date),
(75, 15, 'Bailey', 'Hendricks', '9', '2011-07-04'::date),
(76, 15, 'Hailey', 'Hixon', '29', '2012-06-28'::date),
(77, 15, 'Sophia', 'Lambitz', '5', '2012-06-27'::date),
(78, 15, 'Sophia', 'Miller', '2', '2011-07-25'::date),
(79, 15, 'Haylee', 'Phillips', '11', '2011-08-28'::date),
(80, 15, 'Emma', 'Smith', '10', '2012-03-22'::date),
(81, 15, 'Kalasia', 'Torres', '8', '2012-02-01'::date),
(82, 15, 'Angela', 'Zhong', '7', '2012-04-15'::date),
(83, 16, 'Ti''Anna', 'Browdy', '15', '2011-12-18'::date),
(84, 16, 'Caitlyn', 'Curry', '1', '2011-08-29'::date),
(85, 16, 'Caroline', 'Hammond', '10', '2013-04-27'::date),
(86, 16, 'Annalee', 'Martin', '22', '2012-02-29'::date),
(87, 16, 'Annie', 'Myers', '6', '2013-05-01'::date),
(88, 16, 'Sarithra', 'Navaneethakrishnan', '0', '2012-06-14'::date),
(89, 16, 'Emma', 'Rector', '5', '2012-01-18'::date),
(90, 18, 'Makenna', 'Clarke', '77', '2010-12-20'::date),
(91, 18, 'Ava', 'Doyley', '2', '2011-01-05'::date),
(92, 18, 'Kyla', 'Gay', '5', '2012-10-17'::date),
(93, 18, 'Emily', 'Givens', '2', '2011-03-09'::date),
(94, 18, 'Olivia', 'Harness', '22', '2010-11-19'::date),
(95, 18, 'Abney', 'Harwood', '10', '2010-12-09'::date),
(96, 18, 'Alexis', 'Stembridge', '7', '2011-02-04'::date),
(97, 18, 'Delilah', 'Walther', '11', '2011-03-29'::date),
(98, 18, 'Abigail', 'Wilks', '1', '2010-08-29'::date),
(99, 19, 'Zaniyah', 'Beasley', '3', '2011-05-05'::date),
(100, 19, 'Brantley', 'Brooks', '14', '2010-10-25'::date),
(101, 19, 'Bailey', 'Carroll', '11', '2011-03-21'::date),
(102, 19, 'June', 'Finnell', '6', '2011-06-29'::date),
(103, 19, 'Tallulah', 'Fuller', '7', '2011-03-06'::date),
(104, 19, 'Mackenzie', 'Lambert', '17', '2010-07-14'::date),
(105, 19, 'Mia', 'Morgan', '4', '2011-03-12'::date),
(106, 19, 'Carson', 'Sells', '15', '2011-07-15'::date),
(107, 19, 'Jocelyn', 'Stephenson', '19', '2011-01-03'::date),
(108, 19, 'Maliah', 'Whitaker', '12', '2010-12-09'::date),
(109, 20, 'Aubrey', 'Barbeauld', '5', '2011-05-10'::date),
(110, 20, 'Anna Blaire', 'Barton', '17', '2011-02-03'::date),
(111, 20, 'Ella', 'Donahue', '1', '2010-09-15'::date),
(112, 20, 'Ainsley', 'Henderson', '3', '2011-04-22'::date),
(113, 20, 'Emma', 'Henry', '8', '2010-07-09'::date),
(114, 20, 'Paisley', 'Lockhart', '30', '2011-06-23'::date),
(115, 20, 'Kinley', 'Owens', '2', '2011-04-10'::date),
(116, 20, 'Zoe', 'Paty', '44', '2010-08-06'::date),
(117, 20, 'Kaia', 'Uzarraga', '23', '2010-10-10'::date),
(118, 20, 'Ellie', 'Wilbanks', '4', '2010-11-04'::date),
(119, 21, 'Mariah', 'Evans', '18', '2010-03-18'::date),
(120, 21, 'Annabelle', 'Gibbs', '7', '2009-08-10'::date),
(121, 21, 'Mallory', 'Guest', '4', '2011-04-19'::date),
(122, 21, 'Karis', 'McCarver', '44', '2011-01-31'::date),
(123, 21, 'Leighton', 'McKee', '14', '2010-08-04'::date),
(124, 21, 'Kayliesha', 'Page', '3', '2009-07-05'::date),
(125, 21, 'Raelyn', 'Richmond', '15', '2010-02-15'::date),
(126, 21, 'Cece', 'Sport', '10', '2010-09-01'::date),
(127, 21, 'Brooklyn', 'Stone', '23', '2009-02-01'::date),
(128, 21, 'Addilyn', 'Watts', '17', '2010-08-07'::date),
(129, 22, 'Bella', 'Alatassi', '23', '2009-12-22'::date),
(130, 22, 'Allison', 'Chapman', '25', '2010-05-25'::date),
(131, 22, 'Bayleigh', 'Evans', '22', '2009-11-22'::date),
(132, 22, 'Mya', 'Flores', '30', '2009-11-30'::date),
(133, 22, 'Madelyn', 'Guest', '11', '2009-12-02'::date),
(134, 22, 'Savannah', 'Jacobson', '14', '2010-02-03'::date),
(135, 22, 'Annalise', 'Lofgren', '5', '2010-06-15'::date),
(136, 22, 'Bella', 'Paris', '21', '2009-12-31'::date),
(137, 22, 'Autumn', 'Reagan', '8', '2009-10-20'::date),
(138, 22, 'Valerie', 'Urbina', '15', '2010-02-11'::date),
(139, 22, 'Alexandria', 'Westmoreland', '2', '2010-06-02'::date),
(140, 23, 'Kenzie', 'Barclay', '27', '2010-07-17'::date),
(141, 23, 'Naomi', 'Best', '35', '2009-09-17'::date),
(142, 23, 'Stella', 'Campbell', '9', '2010-12-22'::date),
(143, 23, 'Zoe', 'Campbell', '3', '2009-09-10'::date),
(144, 23, 'Abigail', 'Langston', '4', '2009-09-08'::date),
(145, 23, 'Kiannslee', 'Moses', '8', '2010-04-07'::date),
(146, 23, 'Brianna', 'Nolasco', '16', '2010-01-31'::date),
(147, 23, 'Anslee', 'Parker', '21', '2010-12-09'::date),
(148, 23, 'Danity', 'Peterson', '26', '2010-05-07'::date),
(149, 23, 'Isabella', 'Speller', '20', '2011-03-09'::date),
(150, 24, 'Kynidie', 'Blackwell', '19', '2009-05-02'::date),
(151, 24, 'Maelle', 'Colbert', '3', '2009-03-14'::date),
(152, 24, 'Ava', 'Franklin', '28', '2009-02-19'::date),
(153, 24, 'Tressie', 'Hamrick', '10', '2009-05-22'::date),
(154, 24, 'Kierstyn', 'Holland', '20', '2009-01-26'::date),
(155, 24, 'Sophia', 'Jenkins', '23', '2009-03-22'::date),
(156, 24, 'Malena', 'Jones', '1', '2009-02-02'::date),
(157, 24, 'Eden', 'Mathis', '4', '2008-06-26'::date),
(158, 24, 'Audrey', 'Richardson', '22', '2008-03-08'::date),
(159, 24, 'Allison', 'Schaeffer', '16', '2009-03-23'::date),
(160, 25, 'Brianna', 'Arteaga', '4', '2009-08-13'::date),
(161, 25, 'Avery', 'Brennan', '29', '2008-12-29'::date),
(162, 25, 'Caydence', 'Carroll', '20', '2008-09-18'::date),
(163, 25, 'Kinsey', 'Colborg', '9', '2008-12-30'::date),
(164, 25, 'Ellie', 'Holloway', '12', '2008-09-07'::date),
(165, 25, 'Jillian', 'Jorden', '7', '2009-01-04'::date),
(166, 25, 'Charlotte', 'Ledford', '46', '2010-02-08'::date),
(167, 25, 'Emerson', 'Owens', '22', '2009-06-12'::date),
(168, 25, 'Cheyenne', 'Walters', '5', '2010-05-05'::date),
(169, 26, 'Luke', 'Bartenfield', '30', '2008-04-29'::date),
(170, 26, 'Urijah', 'Dodd', '3', '2011-02-22'::date),
(171, 26, 'Brennan', 'McVity', '11', '2009-12-14'::date),
(172, 26, 'Abel', 'Parsons', '31', '2011-07-22'::date),
(173, 26, 'Seth', 'Richardson', '21', '2010-03-02'::date),
(174, 26, 'Nolan', 'Schaeffer', '7', '2011-05-10'::date),
(175, 26, 'Broxton', 'Smith', '38', '2009-06-09'::date),
(176, 26, 'Zane', 'Warren', '17', '2007-10-22'::date),
(177, 26, 'Isaac', 'Wheatcroft', '5', '2010-05-05'::date),
(178, 27, 'Keller', 'Baughman', '23', '2009-03-30'::date),
(179, 27, 'Benjamin', 'Brennan', '2', '2011-07-05'::date),
(180, 27, 'Yadir', 'Hernandez', '13', '2009-08-30'::date),
(181, 27, 'Nathan', 'Kennedy', '20', '2011-02-20'::date),
(182, 27, 'John', 'McCurdy', '25', '2009-07-25'::date),
(183, 27, 'Landon', 'Pearson', '0', '2008-12-02'::date),
(184, 27, 'Skipper', 'Ridge', '1', '2010-01-26'::date),
(185, 27, 'Malakai', 'Riley', '24', '2010-10-15'::date),
(186, 27, 'Zanovah', 'Ward', '8', '2009-03-06'::date),
(187, 27, 'Cocon', 'Yamada', '14', '2012-06-30'::date);

-- Coaches on the included teams. pin_hash = PIN 9876, scrambled the same
-- way the app does it (lib/coachAuth.ts hashPin), so the app reads it normally.
create temp table _rc (cname text, team_key int, pin_hash text);
insert into _rc values
('Coach Andria Dobson', 4, 'pbkdf2$100000$xIKWKDEbu7twDc5Q4n7Eiw$z4sNvaUH-QoCQhTc3LKn3Y07zpioZExt1iqeD5WbIpw'),
('Coach Bailey Chapman', 5, 'pbkdf2$100000$OTxSU3pWKN_s1taCDtccNg$8QegZGi5IqXuwV_uXGFIWIEA1LUobDXQj2Co2drG3zM'),
('Coach Austin Bryant', 8, 'pbkdf2$100000$p8HBID2rPjT--lUwrxlhUg$xN4QPWz9SMikf5U_iuB8dkCRI0wAX1zhNAroua2Qcg0'),
('Coach Sarah Bass', 9, 'pbkdf2$100000$ZA9Rlo2gIpApflHs_4mQQA$dTStNjeGYDEhth5I79yiqBZNB6SfrumJZ7pQH8WtdTA'),
('Coach Ragen Dobson', 10, 'pbkdf2$100000$Rk5_Dx18_Urv7ynVRgEbEQ$xE1vX47Bi5snbeIpXEVxvH_xr0z_9-VjYPfWDEs3wFo'),
('Coach Ivy Kimmerling', 11, 'pbkdf2$100000$Dmp88dyUodT0nG0HKZ3J2g$_MEU8bcsJgBIKgh83FWsLbD553NPd_jWRElvFShZBNo'),
('Coach Nick Tovar', 13, 'pbkdf2$100000$hyFa6fC6eh21HJ8WXd6M8g$4vwMPnaauoOJtgE97fbL4K3Bw87yCuXd9VAkKUreEL0'),
('Coach Serena Bird', 14, 'pbkdf2$100000$9HWeZzyJPuVWmW6XsSArfg$J5VXkG3ZvVJ36GwlJ0netdHWmT7vrwsw6PKY2ZlGg3k'),
('Coach Emma Carter', 15, 'pbkdf2$100000$lPoxP3_ZT6s3lLYHroFx_Q$SphhzXb7YYP9GeLBNIHmjgEUjWR7LwkL1nKuSHCgvLo'),
('Coach Shannon Carter', 15, 'pbkdf2$100000$LtscPnhSaa3uvXqdQymn5g$mzJyelT53UWO1rmFl-v0hdkWEnnEMThwzkEVVFvNR_g'),
('Coach Skylar Kimmerling', 16, 'pbkdf2$100000$lrUO6m6r4EBCWuPP2pdRaw$IvPPF1fooGCCWflPLiKPjrkN7H7W3xj1eOZr7N92fyA'),
('Coach Alfie Dodd', 18, 'pbkdf2$100000$J1mUkPacUYIUM-B3LRW1VQ$Ro_cWNlTXyrdARNadvfIaxsuom7k5s959wdW7EQmli4'),
('Coach Phillip Finnell', 19, 'pbkdf2$100000$6H-5WZwrITOIqhVDlvuKXA$eo2ZDw5m-2Y80GRAbgVEi0Df3KiaiWkN5JbuM51sBCc'),
('Coach Caitlyn Lambitz', 20, 'pbkdf2$100000$2zFt7v2uqIVv3qHiI48D9w$ySRcD3XCpxLuEG-v4oDLBvSVM6JQuV35i9qhApsXTdw'),
('Coach Jackson Lenoir', 21, 'pbkdf2$100000$EHbngs83rAilTSb8EvAMQw$i4LjZNoOUSuGIaIhp4s5jW1gyT7PucrbSeYEEyZNjsM'),
('Coach Michael DeMeo', 22, 'pbkdf2$100000$Be3KqOCMaJf3sipkU1xApw$YEVpsdPxNGg_LmnFTShhv7uyREF9qqjRowegOgsEpkE'),
('Coach Lauren Cox', 23, 'pbkdf2$100000$8qqHR1w0776lF98d-0I49w$RfKh83a9ISyRya9oVJP8WKD1rOXmDrBwUbUcZrXOoNE'),
('Coach Marjorie Smith', 24, 'pbkdf2$100000$pF1cO3AmKewdshdPu37O3w$wVp1V0Nj2YHbS304v9lsRt2FZnD81HwbijEvlfzIZ-k'),
('Coach Emma Haddix', 25, 'pbkdf2$100000$zG2-PR8TD7AaIUPI_3NDJg$y_-8c8EY5gd7pj1_bF5CfUqBsaqMAfas02DvZ2LXVRU'),
('Coach Ted Hackett', 26, 'pbkdf2$100000$fSJbHL5B-L3lrFY2SZai5w$pzSZtFvY-wy-Q1qgv_L-pcYQkzgAuzrx_AEvjZZ8g_g'),
('Coach Ted Hackett', 27, 'pbkdf2$100000$fSJbHL5B-L3lrFY2SZai5w$pzSZtFvY-wy-Q1qgv_L-pcYQkzgAuzrx_AEvjZZ8g_g');

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Match the roster to what's already in the app (changes nothing yet)
-- ─────────────────────────────────────────────────────────────────────────

-- Teams: an app team matches when its name contains the team nickname
-- ("Pallavolo"), best if it's also active and has the age in its name
create temp table _tcand as
select rt.key, t.id as team_id, t.name, t.age_group, coalesce(t.is_active, false) as is_active,
       (case when coalesce(t.is_active, false) then 2 else 0 end)
     + (case when pg_temp.norm(t.name) like '%' || rt.age || '%' or pg_temp.norm(t.age_group) like '%' || rt.age || '%' then 1 else 0 end) as score
from _rt rt
join public.teams t
  on not coalesce(t.is_open_gym, false)
 and pg_temp.norm(t.name) like '%' || pg_temp.norm(rt.nick) || '%';

create temp table _tm (key int primary key, team_id uuid, old_name text, old_age_group text,
                       old_active boolean, status text);
insert into _tm
select rt.key,
       case when best.n_best = 1 then best.team_id when rt.include and best.key is null then gen_random_uuid() end,
       best.name, best.age_group, best.is_active,
       case when best.key is null then (case when rt.include then 'new' else 'not in app' end)
            when best.n_best > 1 or best.claimed > 1 then 'ambiguous'
            else 'matched' end
from _rt rt
left join lateral (
  select c.*,
         count(*) over (partition by c.score) as n_best,
         (select count(distinct c2.key) from _tcand c2 where c2.team_id = c.team_id) as claimed
  from _tcand c where c.key = rt.key
  order by c.score desc limit 1
) best on true;

-- Players already in the app
create temp table _p as
select id, name, pg_temp.norm(name) as n, date_of_birth as dob, jersey_number as jersey,
       coalesce(is_active, false) as is_active, gender, created_at
from public.players;

-- Their current team(s), not counting Open Gym
create temp table _cur as
select pt.player_id, pt.team_id, t.name as team_name
from public.player_teams pt
join public.teams t on t.id = pt.team_id
where not coalesce(t.is_open_gym, false);

-- Roster players with their target team
create temp table _rpx as
select r.*, pg_temp.norm(r.first || r.last) as rn, pg_temp.norm(r.first) as rf, pg_temp.norm(r.last) as rl,
       tm.team_id, rt.name as team_name, rt.is_boys
from _rp r join _tm tm on tm.key = r.team_key join _rt rt on rt.key = r.team_key;

create temp table _pm (rid int primary key, pid uuid unique, how text, needs_check boolean);

-- Match: same name
insert into _pm
select rid, pid, 'same name', false from (
  select r.rid, p.id as pid,
         count(*) over (partition by r.rid) as n_for_rid,
         row_number() over (partition by r.rid order by
           (exists (select 1 from _cur c where c.player_id = p.id and c.team_id = r.team_id)) desc,
           p.is_active desc, p.created_at asc) as pick,
         count(*) over (partition by p.id) as n_for_pid
  from _rpx r join _p p on p.n = r.rn and (p.dob is null or p.dob = r.dob)
  where r.rid not in (select rid from _pm) and p.id not in (select pid from _pm)
) c
where pick = 1 
  and pid not in (select pid from (
        select p.id as pid, r.rid from _rpx r join _p p on p.n = r.rn and (p.dob is null or p.dob = r.dob)
        where r.rid not in (select rid from _pm) and p.id not in (select pid from _pm)) x
      group by pid having count(*) > 1);

-- Match: same birthday and last name
insert into _pm
select rid, pid, 'same birthday and last name', false from (
  select r.rid, p.id as pid,
         count(*) over (partition by r.rid) as n_for_rid,
         row_number() over (partition by r.rid order by
           (exists (select 1 from _cur c where c.player_id = p.id and c.team_id = r.team_id)) desc,
           p.is_active desc, p.created_at asc) as pick,
         count(*) over (partition by p.id) as n_for_pid
  from _rpx r join _p p on p.dob = r.dob and right(p.n, length(r.rl)) = r.rl
  where r.rid not in (select rid from _pm) and p.id not in (select pid from _pm)
) c
where pick = 1 and n_for_rid = 1
  and pid not in (select pid from (
        select p.id as pid, r.rid from _rpx r join _p p on p.dob = r.dob and right(p.n, length(r.rl)) = r.rl
        where r.rid not in (select rid from _pm) and p.id not in (select pid from _pm)) x
      group by pid having count(*) > 1);

-- Match: same birthday and first name
insert into _pm
select rid, pid, 'same birthday and first name', true from (
  select r.rid, p.id as pid,
         count(*) over (partition by r.rid) as n_for_rid,
         row_number() over (partition by r.rid order by
           (exists (select 1 from _cur c where c.player_id = p.id and c.team_id = r.team_id)) desc,
           p.is_active desc, p.created_at asc) as pick,
         count(*) over (partition by p.id) as n_for_pid
  from _rpx r join _p p on p.dob = r.dob and left(p.n, length(r.rf)) = r.rf
  where r.rid not in (select rid from _pm) and p.id not in (select pid from _pm)
) c
where pick = 1 and n_for_rid = 1
  and pid not in (select pid from (
        select p.id as pid, r.rid from _rpx r join _p p on p.dob = r.dob and left(p.n, length(r.rf)) = r.rf
        where r.rid not in (select rid from _pm) and p.id not in (select pid from _pm)) x
      group by pid having count(*) > 1);

-- Match: similar first name, same last name
insert into _pm
select rid, pid, 'similar first name, same last name', true from (
  select r.rid, p.id as pid,
         count(*) over (partition by r.rid) as n_for_rid,
         row_number() over (partition by r.rid order by
           (exists (select 1 from _cur c where c.player_id = p.id and c.team_id = r.team_id)) desc,
           p.is_active desc, p.created_at asc) as pick,
         count(*) over (partition by p.id) as n_for_pid
  from _rpx r join _p p on right(p.n, length(r.rl)) = r.rl and (p.dob is null or p.dob = r.dob)
       and least(length(r.rf), length(p.n) - length(r.rl)) >= 3
       and (left(p.n, length(p.n) - length(r.rl)) like r.rf || '%' or r.rf like left(p.n, length(p.n) - length(r.rl)) || '%')
  where r.rid not in (select rid from _pm) and p.id not in (select pid from _pm)
) c
where pick = 1 and n_for_rid = 1
  and pid not in (select pid from (
        select p.id as pid, r.rid from _rpx r join _p p on right(p.n, length(r.rl)) = r.rl and (p.dob is null or p.dob = r.dob)
       and least(length(r.rf), length(p.n) - length(r.rl)) >= 3
       and (left(p.n, length(p.n) - length(r.rl)) like r.rf || '%' or r.rf like left(p.n, length(p.n) - length(r.rl)) || '%')
        where r.rid not in (select rid from _pm) and p.id not in (select pid from _pm)) x
      group by pid having count(*) > 1);

-- Match: same team, last name and first initial
insert into _pm
select rid, pid, 'same team, last name and first initial', true from (
  select r.rid, p.id as pid,
         count(*) over (partition by r.rid) as n_for_rid,
         row_number() over (partition by r.rid order by
           (exists (select 1 from _cur c where c.player_id = p.id and c.team_id = r.team_id)) desc,
           p.is_active desc, p.created_at asc) as pick,
         count(*) over (partition by p.id) as n_for_pid
  from _rpx r join _p p on right(p.n, length(r.rl)) = r.rl and left(p.n, 1) = left(r.rf, 1)
       and (p.dob is null or p.dob = r.dob)
       and exists (select 1 from _cur c where c.player_id = p.id and c.team_id = r.team_id)
  where r.rid not in (select rid from _pm) and p.id not in (select pid from _pm)
) c
where pick = 1 and n_for_rid = 1
  and pid not in (select pid from (
        select p.id as pid, r.rid from _rpx r join _p p on right(p.n, length(r.rl)) = r.rl and left(p.n, 1) = left(r.rf, 1)
       and (p.dob is null or p.dob = r.dob)
       and exists (select 1 from _cur c where c.player_id = p.id and c.team_id = r.team_id)
        where r.rid not in (select rid from _pm) and p.id not in (select pid from _pm)) x
      group by pid having count(*) > 1);

-- Match: same name, different birthday
insert into _pm
select rid, pid, 'same name, different birthday', true from (
  select r.rid, p.id as pid,
         count(*) over (partition by r.rid) as n_for_rid,
         row_number() over (partition by r.rid order by
           (exists (select 1 from _cur c where c.player_id = p.id and c.team_id = r.team_id)) desc,
           p.is_active desc, p.created_at asc) as pick,
         count(*) over (partition by p.id) as n_for_pid
  from _rpx r join _p p on p.n = r.rn
  where r.rid not in (select rid from _pm) and p.id not in (select pid from _pm)
) c
where pick = 1 
  and pid not in (select pid from (
        select p.id as pid, r.rid from _rpx r join _p p on p.n = r.rn
        where r.rid not in (select rid from _pm) and p.id not in (select pid from _pm)) x
      group by pid having count(*) > 1);

-- New players (not found in the app)
create temp table _new as
select r.rid, gen_random_uuid() as pid from _rpx r where r.rid not in (select rid from _pm);

-- Coaches: reuse an account that's already there (same name, with or without "Coach")
create temp table _cm as
select c.cname, c.pin_hash,
       coalesce((select co.id from public.coaches co
                 where pg_temp.norm(regexp_replace(co.name, '^\s*coach\s+', '', 'i')) = pg_temp.norm(substr(c.cname, 7))
                 order by co.created_at limit 1), gen_random_uuid()) as coach_id,
       exists (select 1 from public.coaches co
               where pg_temp.norm(regexp_replace(co.name, '^\s*coach\s+', '', 'i')) = pg_temp.norm(substr(c.cname, 7))) as already_there
from (select distinct cname, pin_hash from _rc) c;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Make the changes
-- ─────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from _tm where status = 'ambiguous') then
    raise exception 'Stopped, nothing changed: a roster team matches more than one app team. Run the preview to see which.';
  end if;
end $$;

-- Teams: add missing ones, fix names / age groups, make sure they're on
insert into public.teams (id, name, age_group, is_active)
select tm.team_id, rt.name, rt.age_group, true
from _tm tm join _rt rt using (key) where tm.status = 'new';

update public.teams t
set name = rt.name, age_group = rt.age_group, is_active = true
from _tm tm join _rt rt using (key)
where tm.status = 'matched' and rt.include and t.id = tm.team_id;

-- 12s and local teams: turn off if they're in the app (history is kept)
update public.teams t
set is_active = false
from _tm tm join _rt rt using (key)
where tm.status = 'matched' and not rt.include and t.id = tm.team_id;

-- Players only on a 12s / local team: removed from the app like the Players
-- page Remove button does (is_active off, history kept)
update public.players p
set is_active = false
from _cur c join _tm tm on tm.team_id = c.team_id and tm.status = 'matched' join _rt rt on rt.key = tm.key and not rt.include
where p.id = c.player_id
  and p.id not in (select pid from _pm)
  and not exists (select 1 from _cur c2 join public.teams t2 on t2.id = c2.team_id
                  where c2.player_id = p.id and c2.team_id <> c.team_id and coalesce(t2.is_active, false)
                    and c2.team_id not in (select team_id from _tm tm2 join _rt rt2 using (key) where not rt2.include and tm2.team_id is not null));

-- Players already in the app: roster jersey, birthday if missing, boys set to Boy, active
update public.players p
set jersey_number = r.jersey,
    date_of_birth = r.dob,
    gender = case when r.is_boys then 'M' else p.gender end,
    is_active = true
from _pm m join _rpx r using (rid)
where p.id = m.pid;

-- New players (PIN 1234, same as everyone else right now)
insert into public.players (id, name, pin, jersey_number, date_of_birth, gender, is_active)
select n.pid, r.first || ' ' || r.last, '1234', r.jersey, r.dob, case when r.is_boys then 'M' else 'F' end, true
from _new n join _rpx r using (rid);

-- One team per player (same as Season Rollover). Open Gym is never touched.
--  a) players on the roster: off any other team
delete from public.player_teams pt
using (select m.pid, r.team_id from _pm m join _rpx r using (rid)) x, public.teams t
where pt.player_id = x.pid and pt.team_id <> x.team_id
  and t.id = pt.team_id and not coalesce(t.is_open_gym, false);

--  b) players who are on a roster team in the app but not on its roster: off that team (account kept)
delete from public.player_teams pt
using _tm tm join _rt rt using (key)
where tm.status = 'matched' and rt.include and pt.team_id = tm.team_id
  and pt.player_id not in (select pid from _pm);

--  c) everyone onto their roster team
insert into public.player_teams (player_id, team_id, is_primary)
select x.pid, x.team_id, true
from (select m.pid, r.team_id from _pm m join _rpx r using (rid)
      union all
      select n.pid, r.team_id from _new n join _rpx r using (rid)) x
on conflict (player_id, team_id) do nothing;

-- Coaches: team coach accounts (not admin), PIN 9876, linked to their teams
insert into public.coaches (id, name, role, pin_hash, is_active)
select coach_id, cname, 'coach', pin_hash, true from _cm where not already_there;

insert into public.coach_teams (coach_id, team_id)
select cm.coach_id, tm.team_id
from _rc rc join _cm cm using (cname) join _tm tm on tm.key = rc.team_key
on conflict do nothing;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. What this does / did, one line per item
-- ─────────────────────────────────────────────────────────────────────────
select section, team, name, what_happens from (

  -- Totals
  select 0 as s, 1 as o, '0 SUMMARY' as section, '' as team, '' as name,
         (select count(*) from _rt where include) || ' teams in the app, '
      || (select count(*) from _pm) || ' players already in the app, '
      || (select count(*) from _new) || ' new players, '
      || (select count(*) from _cm where not already_there) || ' new coach accounts'
      || case when exists (select 1 from _tm where status = 'ambiguous')
              then '  ⚠ A TEAM MATCHES MORE THAN ONE APP TEAM: the import will stop, see TEAMS' else '' end
         as what_happens

  -- Teams on the roster
  union all
  select 1, rt.key, '1 TEAMS', rt.name, rt.roster_coaches,
         case
           when not rt.include and tm.status = 'matched' and tm.old_active then 'Left out (' || rt.left_out_because || '): app team "' || tm.old_name || '" will be turned off'
           when not rt.include then 'Left out (' || rt.left_out_because || ')'
           when tm.status = 'ambiguous' then '⚠ Matches more than one app team: ' || (select string_agg('"' || c.name || '"', ', ') from _tcand c where c.key = rt.key)
           when tm.status = 'new' then 'NEW team (not found in the app)'
           when tm.old_name is distinct from rt.name or tm.old_age_group is distinct from rt.age_group or not tm.old_active then
             'Was "' || tm.old_name || '" (' || coalesce(tm.old_age_group, 'no age group') || case when tm.old_active then '' else ', off' end || ') → "' || rt.name || '" (' || rt.age_group || ')'
           else 'Already in the app, no change'
         end
  from _rt rt join _tm tm using (key)

  -- App teams that aren't on the roster at all
  union all
  select 2, 0, '2 OTHER APP TEAMS', t.name, '', 'Not on the roster: left as is'
  from public.teams t
  where coalesce(t.is_active, false) and not coalesce(t.is_open_gym, false)
    and t.id not in (select team_id from _tm where team_id is not null)

  -- Coaches
  union all
  select 3, 0, '3 COACHES', string_agg(rt.name, ', ' order by rt.key), cm.cname,
         case when cm.already_there then 'Already in the app: linked to team(s), PIN not changed'
              else 'NEW team coach (not admin), PIN 9876' end
  from _cm cm join _rc rc using (cname) join _rt rt on rt.key = rc.team_key
  group by cm.cname, cm.already_there

  -- Players already in the app
  union all
  select 4, r.team_key, case when m.needs_check then '4 PLAYERS: CHECK THESE MATCHES' else '5 PLAYERS ALREADY IN APP' end,
         r.team_name,
         p.name || case when p.n <> r.rn then '  (roster: ' || r.first || ' ' || r.last || ')' else '' end,
         coalesce(nullif(concat_ws('; ',
           case when m.needs_check then 'matched by ' || m.how end,
           case when not p.is_active then 'was removed, will be turned back on' end,
           (select 'moves from ' || string_agg(c.team_name, ', ') from _cur c where c.player_id = p.id and c.team_id <> r.team_id),
           case when not exists (select 1 from _cur c where c.player_id = p.id and c.team_id = r.team_id)
                 and not exists (select 1 from _cur c where c.player_id = p.id) then 'added to team' end,
           case when p.jersey is distinct from r.jersey then 'jersey ' || coalesce(p.jersey, 'none') || ' → ' || r.jersey end,
           case when p.dob is null then 'birthday added' when p.dob <> r.dob then 'birthday ' || p.dob || ' → ' || r.dob end,
           case when r.is_boys and p.gender is distinct from 'M' then 'set to Boy' end,
           (select 'the app has ' || count(*) || ' other player(s) with this name: left alone, check'
                   from _p p2 where p2.n = r.rn and p2.id <> p.id having count(*) > 0)), ''), 'No change')
  from _pm m join _rpx r using (rid) join _p p on p.id = m.pid

  -- New players
  union all
  select 6, r.team_key, '6 NEW PLAYERS', r.team_name, r.first || ' ' || r.last,
         'Added: #' || r.jersey || ', born ' || r.dob || ', PIN 1234'
         || coalesce('  (app also has: ' || (select string_agg(p.name, ', ') from _p p
                     where right(p.n, length(r.rl)) = r.rl and p.id not in (select pid from _pm)) || ', same last name, check)', '')
  from _new n join _rpx r using (rid)

  -- Taken off a team
  union all
  select 7, tm.key, '7 TAKEN OFF TEAM', rt.name, p.name,
         'Not on this roster: taken off the team. Account and history kept'
         || case when (select count(*) from _cur c2 where c2.player_id = p.id) = 1 then ' (now not on any team)' else '' end
  from _cur c join _tm tm on tm.team_id = c.team_id and tm.status = 'matched'
  join _rt rt on rt.key = tm.key and rt.include
  join _p p on p.id = c.player_id
  where c.player_id not in (select pid from _pm)

  -- Players on a team that is being turned off
  union all
  select 8, tm.key, '8 ON A LEFT-OUT TEAM', rt.name, p.name, 'Removed from the app (team left out), workout history kept'
  from _cur c join _tm tm on tm.team_id = c.team_id and tm.status = 'matched' and tm.old_active
  join _rt rt on rt.key = tm.key and not rt.include
  join _p p on p.id = c.player_id and p.is_active
  where c.player_id not in (select pid from _pm)

) report
order by s, o, team, name;
