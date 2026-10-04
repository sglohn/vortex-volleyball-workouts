// FILE: app/api/display-snapshot/route.ts
//
// Takes a full-screen picture (1920x1080 JPEG) of the TV Display page
// (/coach/display) for the Roku "Vortex TV Display" app.
//
// The Roku only asks for a picture when the app opens, when the team is
// changed, or when Replay is pressed, so this runs a handful of times a day.
//
// Query params:
//   ?team=<team-id>   which team's workout to show (same as the page's ?team=)
//                     If left off, the first team (in the page's own team
//                     order) that has a workout scheduled today is used.
//
// Response header X-Team-Id tells the Roku which team was pictured.
//
// The page itself is not changed. The hidden browser:
//   - uses Eastern time, so "today" matches the club (Vercel runs on UTC)
//   - looks signed in as a coach, so the coach-area login check doesn't
//     send it to the login page

import { NextRequest, NextResponse } from 'next/server'
import chromium from '@sparticuz/chromium'
import puppeteer, { type Browser } from 'puppeteer-core'
import { createServerClient } from '@/lib/supabase'
import { CLUB_TIMEZONE, clubDateString } from '@/lib/clubTime'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const TEAM_ID_RE = /^[0-9a-f-]{8,64}$/i

type TeamRow = { id: string; age_group: string | null; is_open_gym: boolean | null }

/** First team, in the TV Display page's own order, with a workout today. */
async function firstTeamWithWorkoutToday(): Promise<string | null> {
  const db = createServerClient()
  const today = clubDateString()

  const { data: scheduled } = await db
    .from('team_schedule')
    .select('team_id, template_id')
    .eq('scheduled_date', today)

  const teamIdsWithWorkout = new Set(
    (scheduled ?? []).filter(s => s.template_id).map(s => s.team_id as string)
  )
  if (!teamIdsWithWorkout.size) return null

  const { data: teams } = await db
    .from('teams')
    .select('id, age_group, is_open_gym')
    .eq('is_active', true)

  // Same order as /api/coach/teams: regular teams by age group, Open Gym last
  const ordered = ((teams ?? []) as TeamRow[]).sort((a, b) => {
    if (a.is_open_gym && !b.is_open_gym) return 1
    if (!a.is_open_gym && b.is_open_gym) return -1
    return (a.age_group ?? '').localeCompare(b.age_group ?? '')
  })

  return ordered.find(t => teamIdsWithWorkout.has(t.id))?.id ?? null
}

export async function GET(req: NextRequest) {
  let team = req.nextUrl.searchParams.get('team')
  if (team && !TEAM_ID_RE.test(team)) {
    return NextResponse.json({ error: 'Bad team id' }, { status: 400 })
  }
  if (!team) team = await firstTeamWithWorkoutToday().catch(() => null)

  const origin = process.env.DISPLAY_SNAPSHOT_ORIGIN || req.nextUrl.origin
  const pageUrl = `${origin}/coach/display${team ? `?team=${encodeURIComponent(team)}` : ''}`

  let browser: Browser | null = null
  try {
    chromium.setGraphicsMode = false

    browser = await puppeteer.launch({
      args: await puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
      defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1, isLandscape: true },
      executablePath: process.env.CHROME_EXECUTABLE_PATH || await chromium.executablePath(),
      headless: 'shell',
    })

    const page = await browser.newPage()
    await page.emulateTimezone(CLUB_TIMEZONE)
    await page.evaluateOnNewDocument(() => {
      try { localStorage.setItem('vx_coach', 'true') } catch { /* ignore */ }
    })

    await page.goto(pageUrl, { waitUntil: 'networkidle0', timeout: 40_000 })

    // Let web fonts and exercise images finish before the picture is taken
    await page.evaluate(async () => {
      await document.fonts?.ready
      await Promise.all(
        Array.from(document.images)
          .filter(img => !img.complete)
          .map(img => new Promise<void>(resolve => {
            img.addEventListener('load', () => resolve(), { once: true })
            img.addEventListener('error', () => resolve(), { once: true })
          }))
      )
    })
    await new Promise(resolve => setTimeout(resolve, 500))

    const image = await page.screenshot({ type: 'jpeg', quality: 90 })

    return new NextResponse(Buffer.from(image), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-store',
        'X-Team-Id': team ?? '',
      },
    })
  } catch (err) {
    console.error('display-snapshot failed', err)
    const detail = err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300)
    return NextResponse.json({ error: 'Snapshot failed', detail }, { status: 500 })
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}
