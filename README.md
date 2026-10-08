# Weight Room Workouts

A mobile-first weight room app: players sign in with a 4-digit PIN, follow the
day's workout and log their sets; coaches build workouts, schedules and
programs and see what players are doing.

One codebase runs two separate sites, each with its own Vercel project and its
own Supabase database:

| Site | `NEXT_PUBLIC_BRAND` | Sport |
|---|---|---|
| Vortex Volleyball | `vortex` (default when not set) | volleyball |
| Bruisers Lacrosse | `lacrosse` | lacrosse |

Pushing to `main` deploys both sites. The brand setting picks the names, logos
and colors (`lib/brand.ts`) and switches off features the sport doesn't use
(`lib/features.ts`): measurements, bar speed (VBT) and the TV display are
volleyball-only.

## Environment variables (per Vercel project)

```
NEXT_PUBLIC_BRAND=lacrosse            # omit for Vortex
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role key>   # server only
COACH_PIN=<4 digits>
COACH_SESSION_SECRET=<random, 32+ characters>
```

The app only talks to Supabase from the server, so no Supabase key is sent to
browsers. `NEXT_PUBLIC_SUPABASE_ANON_KEY` is no longer used.

## Setting up a new database

1. Create an empty Supabase project.
2. In its SQL Editor, run `supabase/migrations/0001_baseline.sql` once. It
   builds every table with row level security on and no public access.
3. To copy an exercise library: run `supabase/export-exercises.sql` in the
   source project, download the result as CSV, then use
   **Coach → Exercise Library → Import** on the new site.

Later migrations in `supabase/migrations/` are dated and already included in
the baseline. (`supabase/schema.sql` is the original, out-of-date schema and is
kept for reference only.)

## Run locally

```bash
npm install
npm run dev
```

Tech: Next.js 15, React 19, Tailwind CSS, Supabase (PostgreSQL), Vercel.
