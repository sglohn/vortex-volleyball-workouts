# Roku apps

The current source for the sideloaded Roku apps. The website doesn't use
anything in this folder; it's kept here so the latest version is always
in one place. **Whenever a Roku app changes, update its folder here.**

| Folder | Install on | App |
|---|---|---|
| `tv-display/` | **Weight Room Roku**, http://10.1.10.219/ | **Vortex TV Display** v1.1.0: picture of today's workout with demo clips, OK flips to the live leaderboard. Opens the leaderboard by itself on a Combine Day |
| `scoreboard-leaderboard/` | **Scoreboard Roku**, http://10.1.10.95/ | **Vortex Scoreboard + Leaderboard** v2.2.0: menu to pick the scoreboard or the live leaderboard |
| `scoreboard-original/` | (not installed) | The original plain **Volleyball Scoreboard**, kept to go back to |

Last installed on both Rokus: Oct 13, 2026 (TV Display v1.0.5, Scoreboard +
Leaderboard v2.1.0). **v1.1.0 / v2.2.0 (Combine Day header) not installed yet.**

The addresses only work on the club's Wi-Fi. If one stops loading, the
Roku may have been given a new address: on that Roku go to
**Settings → Network → About** to see its current one, then update it here.

The version is in each app's `manifest` (`major_version`, `minor_version`,
`build_version`).

## Leaderboard buttons (both apps)

- **Left / Right** (or Rewind / Fast-forward): previous / next page. The
  page is held for 60 seconds after the last press (`hold_seconds` in
  `manifest`), then pages turn by themselves every 15 seconds again.
- **OK / Back**: leave the leaderboard.

Which boards make up each page is decided by the website
(`app/api/leaderboard/route.ts` and `lib/leaderboardBoards.ts`), so board
changes don't need a Roku update.

**Combine Day** (`lib/combineLeaderboard.ts`): when a team has a Combine Day
today, the combine pages come first (Combine Score, Approach Jump, Block
Jump, Speed, Swing Velocity, Length) with New Bests Today in the third
column. From v1.1.0 / v2.2.0 the header shows the site's `title`
(COMBINE DAY LEADERBOARD) and `summaryText`; older versions show the combine
boards too, under their usual WEIGHT ROOM LEADERBOARD header.

`LeaderboardView.*` and `LeaderboardTask.*` are the same in both apps.
Change them in both folders together.

## Making the zip to upload

The zip must have `manifest` at its top level, not inside a folder.

- **Windows:** open the app's folder, select everything inside it
  (`manifest`, `source`, `components`, `images`, and `sounds` if there),
  right-click, then **Send to → Compressed (zipped) folder**.
- **Mac:** open the app's folder, select everything inside it, right-click,
  then **Compress**.

Open that Roku's address from the table above in a browser on the club
Wi-Fi, sign in with username `rokudev` and that Roku's developer password,
upload the zip and press **Replace**. Check the app name on the page before
pressing Replace, so the right app goes on the right Roku.
