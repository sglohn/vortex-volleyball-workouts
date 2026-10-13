# Roku apps

The current source for the sideloaded Roku apps. The website doesn't use
anything in this folder; it's kept here so the latest version is always
in one place. **Whenever a Roku app changes, update its folder here.**

| Folder | Roku | App |
|---|---|---|
| `tv-display/` | Weight room TV Display Roku | **Vortex TV Display** v1.0.5: picture of today's workout with demo clips, OK flips to the live leaderboard |
| `scoreboard-leaderboard/` | Scoreboard Roku | **Vortex Scoreboard + Leaderboard** v2.1.0: menu to pick the scoreboard or the live leaderboard |
| `scoreboard-original/` | (not installed) | The original plain **Volleyball Scoreboard**, kept to go back to |

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

`LeaderboardView.*` and `LeaderboardTask.*` are the same in both apps.
Change them in both folders together.

## Making the zip to upload

The zip must have `manifest` at its top level, not inside a folder.

- **Windows:** open the app's folder, select everything inside it
  (`manifest`, `source`, `components`, `images`, and `sounds` if there),
  right-click, then **Send to → Compressed (zipped) folder**.
- **Mac:** open the app's folder, select everything inside it, right-click,
  then **Compress**.

Upload it at `http://<roku-ip>` (username `rokudev`) and press
**Replace**.
