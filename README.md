# Vortex Volleyball Workout Tracker

A mobile-first weight room tracking app for Vortex Volleyball players.

## Features
- Player check-in with PIN authentication
- Workout logging with set-by-set weight tracking
- Automatic 1-rep max estimation (Epley formula)
- Weight recommendations based on training zone
- Athlete measurements (height, wingspan, reach, verticals)
- Progress charts for players
- Coach dashboard with attendance, flags, and per-player analytics

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/vortex-workouts.git
cd vortex-workouts
npm install
```

### 2. Set up Supabase

1. Go to [supabase.com](https://supabase.com) → New project
2. Name it `vortex-workouts` (separate from your other projects)
3. Go to **SQL Editor** and run the entire contents of `supabase/schema.sql`
4. Go to **Settings → API** and copy:
   - Project URL
   - `anon` public key
   - `service_role` secret key

### 3. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
COACH_PIN=your_4_digit_pin
```

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 5. Deploy to Vercel

1. Push to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import your repo
3. Add the same environment variables from `.env.local` in Vercel's dashboard
4. Deploy

---

## Usage

### As a coach
1. Go to `/coach` and enter your coach PIN
2. Add players (Players tab) — give each player a name and 4-digit PIN
3. Create a workout (Workouts tab) — add exercises, sets, reps, rest time
4. Set it as "Active" so players see it on check-in
5. Monitor from the Dashboard

### As a player
1. Go to the home page
2. Find your name, enter your PIN
3. Work through the workout — tap each set to log weight and reps
4. When done, tap "Finish Workout"

---

## Architecture

- **Next.js 15** (App Router) on Vercel
- **Supabase** for database (PostgreSQL)
- **Recharts** for progress charts
- No external auth library — simple PIN system appropriate for a team environment

## Extending


- Add email/push notifications for missed sessions
- Add a rest timer per exercise
- Add workout templates / periodization planner
- Add export to CSV for external analysis
