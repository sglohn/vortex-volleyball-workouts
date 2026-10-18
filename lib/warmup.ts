// FILE: lib/warmup.ts
//
// The warm-up section of a workout template.
//
// A warm-up is saved as an ordinary template block whose label starts with
// "W" ("Warmup", or "Warmup Circuit" on older templates). It is handled
// differently from the lifting blocks everywhere:
//
//   - Coach template editor (app/coach/templates): its own section at the
//     top, added with "+ Add Warm-Up". "Rounds" instead of sets, no bar
//     speed targets.
//   - Player workout page (app/player/workout): a Warm-Up card at the top
//     with each exercise's demo clip playing, so players can see what to
//     do. Nothing to log, and it doesn't hold up "Finish Workout".
//   - Workout API (app/api/workout): sent as `template.warmup`, kept out of
//     `template.blocks`, so the kiosk and session pages never ask players to
//     log warm-up sets.
//   - TV Display (app/coach/display): one compact line of exercise names
//     across the top, no clips, so the lifting blocks keep their size.

export const WARMUP_LABEL = 'Warmup'

export function isWarmupLabel(label: string | null | undefined): boolean {
  return /^w/i.test((label ?? '').trim())
}
