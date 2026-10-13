# Volleyball Scoreboard (Roku Channel)

A private Roku "channel" (Roku's word for app) that turns any TV into a
courtside scoreboard: two team scores, sets won, and a countdown timer,
all controlled with the standard Roku remote.

## Controls

The screen has five focus stops, cycled with `◄`/`►`: **Team A score**,
**Team A sets**, the **Timer**, **Team B score**, **Team B sets**. The
active one is highlighted (whole panel tints, plus a bright frame
around the exact spot in focus).

| Button | Score focused | Sets focused | Timer focused |
|---|---|---|---|
| ▲ / ▼ | +1 / −1 point | +1 / −1 (a free counter — handy for practice drills too) | +5s / −5s to the timer, live, whether it's running or paused |
| OK | Open rename keyboard for that team | Open rename keyboard for that team | — |
| Play/Pause | Start / pause the timer (works from any focus) |||
| Replay | Reset timer back to its last set length (works from any focus) |||
| Rewind | +1 point to the LEFT team, instantly, no need to navigate there (works from any focus) |||
| Fast Forward | +1 point to the RIGHT team, instantly, no need to navigate there (works from any focus) |||
| `*` (Options) | +1 to that team's sets counter, score untouched | +1 to that team's sets counter | Full reset — scores, sets, AND the timer |
| Back | Reset scores only, back to 0-0 (works from any focus) |||

Sets are fully decoupled from score — awarding one doesn't touch the
score, and you can freely bump the sets counter up or down, so it
doubles as a general-purpose number for practice drills, reps, or
anything else.

Rewind and Fast Forward need a remote with those dedicated buttons
(most Roku Voice Remote Pro and Enhanced remotes have them); a basic
remote without them just won't send those key presses, and everything
else still works normally.

To rename a team: move focus onto that team (score or sets side) and
press OK. An on-screen keyboard appears — use the arrows to move
between letters, OK to pick one, and Back to cancel without saving.
The "OK" cell in the keyboard's bottom row confirms the new name.

Everything is one button press, no menus, so you can keep it moving
during play. Default timer length is 60 seconds — see "Customizing"
below to change it.

## 1. Test it on your TV today (sideloading)

You don't need to publish anything to try this out — Roku lets you
load a channel straight onto your own device for free:

1. **Turn on Developer Mode** on the Roku: Home → press `Home` 3x,
   `Up` 2x, `Right`, `Left`, `Right`, `Left`, `Right` (the classic Roku
   "Konami code"). It'll show a screen with the device's IP address —
   note that IP, and set a developer username/password when prompted.
2. On your computer, zip up this whole folder's *contents* (not the
   folder itself — `manifest` should be at the top level of the zip).
3. Open a browser to `http://<roku-ip-address>` and log in with the
   dev credentials from step 1.
4. Under "Upload," choose the zip file and click Install.
5. The Volleyball Scoreboard channel launches immediately on the TV.

Re-zip and re-upload any time you tweak the code — no rebuild step
needed beyond that.

## 2. Publishing it to the Channel Store

Once you're happy with it, putting it in the public Roku Channel Store
is a separate process:

1. Create a Roku Developer account at https://developer.roku.com and
   register as a publisher (a small one-time verification fee applies).
2. From the developer dashboard, add a new channel and generate a
   signed package from this code (the dashboard walks you through
   "rekeying" your device and packaging the .zip into a signed .pkg).
3. Fill in the store listing — replace the placeholder icons/splash
   screens in `images/` with real artwork sized 336×210, 108×69,
   1280×720, and 720×480 (the club logo would work well here).
4. Submit for certification. Roku reviews for basic quality/content
   guidelines; simple utility channels like this one are usually
   straightforward. Once approved it goes public (or you can mark it
   private/unlisted if it's just for your own club's use).

## Customizing

- **Team names**: edit the `text="HOME"` / `text="AWAY"` values in
  `components/MainScene.xml`.
- **Default timer length**: change `m.timerDuration = 60` near the top
  of `components/MainScene.brs` (in seconds).
- **Colors/sizes**: the panel colors, fonts, and layout are all in
  `components/MainScene.xml` — sizes are in pixels on a 1280×720 canvas.

## File structure

```
manifest                     - channel metadata, points to icons
source/main.brs              - entry point, opens the scoreboard screen
components/MainScene.xml     - on-screen layout (panels, labels, timer)
components/MainScene.brs     - all the logic: state + remote button handling
images/                      - icons & splash screens (placeholders — swap for real art before publishing)
```

## Combined version: Scoreboard + Weight Room Leaderboard

This build packs the scoreboard and the Vortex weight room leaderboard
into one sideloaded app, because a Roku only holds one sideloaded app
at a time.

- Opening the app shows a menu with two tiles: **Scoreboard** and
  **Leaderboard**. Left/Right picks, OK opens. It starts on whichever one
  you used last.
- **Scoreboard** works exactly as before; every button does the same
  thing. Because Back still resets the scores, leave the scoreboard by
  pressing **Home** and reopening the app.
- **Leaderboard** refreshes every 5 seconds from `/api/leaderboard` and
  turns its pages every 15 seconds. **Left/Right** (or Rewind/Fast-forward)
  step through the pages and hold one up; after 60 seconds without a press
  it goes back to turning pages by itself. **Back** or **OK** returns to
  the menu.
- Leaderboard settings (`leaderboard_url`, `poll_seconds`, `hold_seconds`)
  are at the bottom of `manifest`.

Going back to the plain scoreboard later: reinstall the original
`volleyball-scoreboard-roku.zip`.

Files added for the combined version: `components/AppScene.*` (menu),
`components/LeaderboardView.*` and `components/LeaderboardTask.*`
(leaderboard). Changed: `source/main.brs` opens AppScene, `manifest`
title and leaderboard settings, and `components/MainScene.xml` now
extends `Group` instead of `Scene`. `components/MainScene.brs` is
unchanged.
