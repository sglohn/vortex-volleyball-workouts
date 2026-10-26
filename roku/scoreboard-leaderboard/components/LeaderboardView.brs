' FILE: components/LeaderboardView.brs  (Vortex Weight Room Leaderboard)
' Builds the three boards once, then updates their text and bars every
' time LeaderboardTask delivers fresh data (every few seconds).
'
' Pages: the site decides which boards make up each page and turns the page
' every 15 seconds. Left/Right (or Rewind/Fast-forward) asks the site for a
' particular page instead and holds it there. 60 seconds after the last
' press (hold_seconds in manifest) it goes back to turning by itself.
'
' Header: the site can send `title` (e.g. COMBINE DAY LEADERBOARD on a
' Combine Day page) and `summaryText` (the whole line under it). Without
' them it shows WEIGHT ROOM LEADERBOARD and builds the line itself.

sub init()
    m.MAX_ROWS = 8
    m.COL_WIDTH = 376
    m.COL_GAP = 26
    m.COL_LEFT = 50
    m.COL_TOP = 122
    m.COL_HEIGHT = 580
    m.ROW_TOP = 92
    m.ROW_HEIGHT = 60
    m.BAR_WIDTH = 160
    m.lastUpdate = ""

    ' Page the site last showed, and the page held with the remote (0 = none)
    m.pageIndex = 0
    m.pageCount = 0
    m.heldPage = 0

    m.boardsGroup = m.top.findNode("boards")
    m.emptyState = m.top.findNode("emptyState")
    m.title = m.top.findNode("title")
    m.summary = m.top.findNode("summary")
    m.status = m.top.findNode("status")
    m.pageLabel = m.top.findNode("pageLabel")

    m.holdTimer = m.top.findNode("holdTimer")
    holdSeconds = Val(CreateObject("roAppInfo").GetValue("hold_seconds"))
    if holdSeconds >= 5 then m.holdTimer.duration = holdSeconds
    m.holdTimer.ObserveField("fire", "onHoldEnded")

    m.hintTimer = m.top.findNode("hintTimer")
    m.hintTimer.ObserveField("fire", "onHintEnded")
    m.hint = ""

    m.columns = []
    for c = 0 to 2
        m.columns.Push(buildColumn(m.COL_LEFT + c * (m.COL_WIDTH + m.COL_GAP)))
    end for

    m.top.findNode("blink").control = "start"

    m.task = CreateObject("roSGNode", "LeaderboardTask")
    m.task.ObserveField("data", "onData")
    m.task.ObserveField("status", "onStatus")
    m.task.control = "RUN"
end sub

sub onActiveChanged()
    if m.top.active = false and m.task <> invalid
        m.task.active = false
        m.task.control = "STOP"
        m.holdTimer.control = "stop"
        m.hintTimer.control = "stop"
    end if
end sub

function onKeyEvent(key as string, press as boolean) as boolean
    if not press then return false

    if key = "right" or key = "fastforward"
        changePage(1)
        return true
    else if key = "left" or key = "rewind"
        changePage(-1)
        return true
    end if

    if (key = "back" or key = "OK") and m.top.backGoesToMenu
        m.top.exitRequested = true
        return true
    end if
    return false
end function

' ── Pages ────────────────────────────────────────────────────────────────

sub changePage(stepBy as integer)
    if m.pageCount < 1
        showHint("Pages show up once players check in")
        return
    end if

    current = m.heldPage
    if current = 0 then current = m.pageIndex
    if current < 1 then current = 1

    nextPage = current + stepBy
    if nextPage > m.pageCount then nextPage = 1
    if nextPage < 1 then nextPage = m.pageCount

    m.heldPage = nextPage
    m.task.pinnedPage = nextPage
    m.task.refreshNow = true

    ' Restart the countdown back to turning pages by itself
    m.holdTimer.control = "stop"
    m.holdTimer.control = "start"

    updatePageLabel(nextPage, m.pageCount)
    showHint("Loading page " + nextPage.ToStr() + "...")
end sub

sub onHoldEnded()
    m.heldPage = 0
    m.task.pinnedPage = 0
    m.task.refreshNow = true
    updatePageLabel(m.pageIndex, m.pageCount)
end sub

sub updatePageLabel(index as integer, count as integer)
    if count < 1
        m.pageLabel.text = ""
        return
    end if
    text = "PAGE " + index.ToStr() + " OF " + count.ToStr()
    if m.heldPage > 0
        m.pageLabel.text = text + "  -  HELD"
        m.pageLabel.color = "0xfbbf24ff"
    else
        m.pageLabel.text = text
        m.pageLabel.color = "0x94a3b8ff"
    end if
end sub

sub showHint(text as string)
    m.hint = text
    m.status.color = "0xfbbf24ff"
    m.status.text = text
    m.hintTimer.control = "stop"
    m.hintTimer.control = "start"
end sub

sub onHintEnded()
    m.hint = ""
    m.status.color = "0x94a3b8ff"
    if m.lastUpdate <> "" then m.status.text = "Updated " + m.lastUpdate
end sub

' ── Building ─────────────────────────────────────────────────────────────

function makeLabel(parent as object, x as integer, y as integer, w as integer, h as integer, font as string, color as string, align as string) as object
    l = parent.CreateChild("Label")
    l.translation = [x, y]
    l.width = w
    l.height = h
    l.font = font
    l.color = color
    l.horizAlign = align
    l.vertAlign = "center"
    return l
end function

function makeRect(parent as object, x as integer, y as integer, w as integer, h as integer, color as string) as object
    r = parent.CreateChild("Rectangle")
    r.translation = [x, y]
    r.width = w
    r.height = h
    r.color = color
    return r
end function

function buildColumn(x as integer) as object
    g = m.boardsGroup.CreateChild("Group")
    g.translation = [x, m.COL_TOP]

    makeRect(g, 0, 0, m.COL_WIDTH, m.COL_HEIGHT, "0x111a2eff")
    col = {
        group: g
        title: makeLabel(g, 14, 8, m.COL_WIDTH - 28, 40, "font:MediumBoldSystemFont", "0xffffffff", "left")
        sub: makeLabel(g, 14, 48, m.COL_WIDTH - 28, 30, "font:SmallSystemFont", "0x94a3b8ff", "left")
        accentBar: makeRect(g, 0, 82, m.COL_WIDTH, 4, "0x56a0d3ff")
        highlight: makeRect(g, 0, m.ROW_TOP, m.COL_WIDTH, m.ROW_HEIGHT, "0x56a0d326")
        rows: []
    }

    for r = 0 to m.MAX_ROWS - 1
        rg = g.CreateChild("Group")
        rg.translation = [0, m.ROW_TOP + r * m.ROW_HEIGHT]
        rg.visible = false
        row = {
            group: rg
            rank: makeLabel(rg, 0, 0, 40, m.ROW_HEIGHT, "font:MediumBoldSystemFont", "0x94a3b8ff", "center")
            chip: makeRect(rg, 42, 12, 5, 36, "0x56a0d3ff")
            name: makeLabel(rg, 56, 2, m.BAR_WIDTH, 30, "font:SmallBoldSystemFont", "0xffffffff", "left")
            team: makeLabel(rg, 56, 29, m.BAR_WIDTH, 24, "font:SmallSystemFont", "0x94a3b8ff", "left")
            barBg: makeRect(rg, 56, 55, m.BAR_WIDTH, 3, "0x1f2a3dff")
            bar: makeRect(rg, 56, 55, 0, 3, "0x56a0d3ff")
            value: makeLabel(rg, 220, 0, 146, m.ROW_HEIGHT, "font:MediumBoldSystemFont", "0xffffffff", "right")
        }
        col.rows.Push(row)
    end for

    return col
end function

' ── Updating ─────────────────────────────────────────────────────────────

sub onData()
    d = m.task.data
    if d = invalid then return

    ' A reply that was already on its way before a button press is for the
    ' old page; skip it so the board doesn't flick back.
    asked = 0
    if d.requestedPage <> invalid then asked = Int(d.requestedPage)
    if asked <> m.heldPage then return

    if d.asOf <> invalid then m.lastUpdate = d.asOf
    if m.hint = ""
        m.status.color = "0x94a3b8ff"
        m.status.text = "Updated " + m.lastUpdate
    end if

    if d.page <> invalid and d.page.index <> invalid and d.page.count <> invalid
        m.pageIndex = Int(d.page.index)
        m.pageCount = Int(d.page.count)
        ' Page count can shrink as the day changes; keep a held page in range
        if m.heldPage > m.pageCount and m.pageCount > 0
            m.heldPage = m.pageIndex
            m.task.pinnedPage = m.heldPage
        end if
    else
        m.pageIndex = 0
        m.pageCount = 0
    end if
    updatePageLabel(m.pageIndex, m.pageCount)

    s = d.summary
    if s = invalid or d.categories = invalid then return

    m.title.text = textOr(d.title, "WEIGHT ROOM LEADERBOARD")

    summaryText = textOr(d.summaryText, "")
    if summaryText <> ""
        m.summary.text = summaryText
    else
        parts = []
        if d.dayLabel <> invalid then parts.Push(plainText(d.dayLabel))
        parts.Push(Int(s.lifting).ToStr() + " lifting")
        if Int(s.finished) > 0 then parts.Push(Int(s.finished).ToStr() + " finished")
        if s.totalLbsLabel <> invalid then parts.Push(s.totalLbsLabel + " lbs moved")
        m.summary.text = joinParts(parts, "   |   ")
    end if

    if Int(s.checkedIn) = 0
        m.boardsGroup.visible = false
        m.emptyState.visible = true
        return
    end if
    m.boardsGroup.visible = true
    m.emptyState.visible = false

    for c = 0 to 2
        col = m.columns[c]
        cat = invalid
        if c < d.categories.Count() then cat = d.categories[c]
        if cat = invalid
            col.group.visible = false
        else
            col.group.visible = true
            fillColumn(col, cat)
        end if
    end for
end sub

sub fillColumn(col as object, cat as object)
    accent = "0x56a0d3ff"
    if cat.accent <> invalid then accent = cat.accent

    col.title.text = plainText(cat.title)
    col.sub.text = plainText(cat.sub)
    col.accentBar.color = accent
    col.highlight.color = Left(accent, 8) + "26"

    rows = cat.rows
    if rows = invalid then rows = []
    col.highlight.visible = rows.Count() > 0

    rankColors = ["0xfbbf24ff", "0xcbd5e1ff", "0xd97706ff"]

    for r = 0 to m.MAX_ROWS - 1
        row = col.rows[r]
        if r < rows.Count()
            item = rows[r]
            row.group.visible = true

            row.rank.text = Int(item.rank).ToStr()
            if r < 3
                row.rank.color = rankColors[r]
            else
                row.rank.color = "0x64748bff"
            end if

            row.chip.color = item.teamColor
            row.name.text = plainText(item.name)
            teamText = plainText(item.team)
            if item.done = true then teamText = teamText + "  -  DONE"
            row.team.text = teamText

            row.bar.color = accent
            row.bar.width = Int(m.BAR_WIDTH * clampPct(item.bar) / 100)

            row.value.text = plainText(item.value)
            if r = 0
                row.value.color = accent
            else
                row.value.color = "0xffffffff"
            end if
        else
            row.group.visible = false
        end if
    end for
end sub

sub onStatus()
    if m.task.status = "error"
        m.status.color = "0xf97316ff"
        if m.lastUpdate = ""
            m.status.text = "Can't reach the server, retrying..."
        else
            m.status.text = "Reconnecting... (last update " + m.lastUpdate + ")"
        end if
    end if
end sub

' ── Helpers ──────────────────────────────────────────────────────────────

' Swaps characters this hardware may not draw (em/en dashes, curly quotes)
' for plain ASCII.
function plainText(v as dynamic) as string
    if v = invalid then return ""
    s = v.ToStr()
    s = s.Replace(Chr(8212), "-")
    s = s.Replace(Chr(8211), "-")
    s = s.Replace(Chr(8217), "'")
    s = s.Replace(Chr(8216), "'")
    s = s.Replace(Chr(183), "|")
    return s
end function

' The site's text, or `fallback` when it sent none (null, missing or empty)
function textOr(v as dynamic, fallback as string) as string
    if v = invalid then return fallback
    if type(v) <> "roString" and type(v) <> "String" then return fallback
    if v = "" then return fallback
    return plainText(v)
end function

function clampPct(v as dynamic) as integer
    if v = invalid then return 0
    n = Int(v)
    if n < 0 then return 0
    if n > 100 then return 100
    return n
end function

function joinParts(parts as object, sep as string) as string
    out = ""
    for i = 0 to parts.Count() - 1
        if i > 0 then out = out + sep
        out = out + parts[i]
    end for
    return out
end function
