' FILE: components/DisplayScene.brs  (Vortex TV Display)
'
' Workout display: a picture of your site's TV Display page. A new picture
' is only taken when the app opens, when you change team, or when you press
' Replay.
'
' Demo clips: exercises with a demo clip play it one at a time, right on top
' of their still picture in the workout picture, for clip_seconds (manifest)
' each, then the next one starts. A Roku can only play one video at a time.
' The site says where each clip sits (X-Clips header, see SnapshotTask.brs).
'
' Buttons (workout display):
'   Left / Right - previous / next team with a workout today (picture
'                  updates after a short pause). If no team has a workout
'                  today, all teams are offered instead.
'   Replay       - refresh today's team list and take a fresh picture
'   OK           - switch to the live leaderboard
'   Play/Pause   - hold on the clip now playing / start cycling again
'   Rew / FF     - previous / next clip
'   *            - show the button help again
'   Back         - exit the app
' Buttons (leaderboard):
'   Left / Right - previous / next leaderboard page (held for hold_seconds,
'                  then pages turn by themselves again). Rew / FF also work.
'   OK or Back   - return to the workout display

sub init()
    m.top.backgroundColor = "0x0D1117FF"
    m.top.backgroundUri = ""

    info = CreateObject("roAppInfo")
    m.siteUrl = info.GetValue("site_url")
    if Right(m.siteUrl, 1) = "/" then m.siteUrl = Left(m.siteUrl, Len(m.siteUrl) - 1)

    m.firstLoad = m.top.findNode("firstLoad")
    m.firstLoadText = m.top.findNode("firstLoadText")
    m.posters = [m.top.findNode("posterA"), m.top.findNode("posterB")]
    m.front = -1          ' which poster is showing (-1 = none yet)
    m.statusNote = m.top.findNode("statusNote")
    m.statusText = m.top.findNode("statusText")
    m.hint = m.top.findNode("hint")

    m.hintTimer = m.top.findNode("hintTimer")
    m.hintTimer.ObserveField("fire", "onHintTimer")
    m.teamChangeTimer = m.top.findNode("teamChangeTimer")
    m.teamChangeTimer.ObserveField("fire", "onTeamChangeTimer")
    m.statusTimer = m.top.findNode("statusTimer")
    m.statusTimer.ObserveField("fire", "onStatusTimer")

    for each p in m.posters
        p.ObserveField("loadStatus", "onPosterLoadStatus")
    end for

    m.teams = []
    m.todayOnly = true
    m.teamIndex = -1
    m.teamId = readSetting("teamId")
    m.teamsTask = invalid
    m.snapshotAfterTeams = false
    m.requestId = 0
    m.snapshotTask = invalid
    m.lastFile = ""
    m.loadingFile = ""
    m.leaderboard = invalid

    ' Demo clips
    m.clipVideo = m.top.findNode("clipVideo")
    m.clipVideo.ObserveField("state", "onClipState")
    m.clipTimer = m.top.findNode("clipTimer")
    m.clipTimer.ObserveField("fire", "onClipTimer")
    seconds = Val(info.GetValue("clip_seconds"))
    if seconds < 3 then seconds = 8
    m.clipTimer.duration = seconds
    m.clips = []           ' clips in the picture now showing
    m.loadingClips = []    ' clips for the picture now loading
    m.clipIndex = 0
    m.clipFails = 0        ' clips in a row that wouldn't play
    m.clipHold = false     ' Play button: stay on the current clip

    m.keepAlive = CreateObject("roSGNode", "KeepAliveTask")
    m.keepAlive.control = "RUN"

    ' Get today's teams first, then take the first picture
    loadTeams(true)

    showHint()
    m.top.setFocus(true)
end sub

' ── Teams ────────────────────────────────────────────────────────────────

' Fetches the teams with a workout today. If thenSnapshot is true, a new
' picture is taken once the list arrives (or fails to arrive).
sub loadTeams(thenSnapshot as boolean)
    m.snapshotAfterTeams = thenSnapshot
    task = CreateObject("roSGNode", "JsonFetchTask")
    task.url = m.siteUrl + "/api/display-teams"
    task.ObserveField("status", "onTeamsLoaded")
    task.control = "RUN"
    m.teamsTask = task
    if thenSnapshot then showStatus("Updating...", "0xFFFFFFFF", false)
end sub

sub onTeamsLoaded(event as object)
    task = event.GetRoSGNode()
    if not task.isSameNode(m.teamsTask) then return

    data = task.data
    if task.status = "ok" and data <> invalid and data.teams <> invalid
        m.teams = []
        for each t in data.teams
            if t.id <> invalid
                name = "Team"
                if t.name <> invalid then name = t.name
                m.teams.Push({ id: t.id, name: name })
            end if
        end for
        m.todayOnly = true
        if data.todayOnly <> invalid then m.todayOnly = data.todayOnly

        ' Keep the current team if it has a workout today; otherwise start
        ' at the first team with a workout today
        m.teamIndex = -1
        for i = 0 to m.teams.Count() - 1
            if m.teams[i].id = m.teamId then m.teamIndex = i
        end for
        if m.teamIndex = -1 and m.teams.Count() > 0 and (m.todayOnly or m.teamId = "")
            m.teamIndex = 0
            m.teamId = m.teams[0].id
            saveSetting("teamId", m.teamId)
        end if
    end if

    if m.snapshotAfterTeams
        m.snapshotAfterTeams = false
        requestSnapshot()
    end if
end sub

sub changeTeam(delta as integer)
    n = m.teams.Count()
    if n = 0
        showStatus("Team list still loading...", "0xFFFFFFFF", true)
        return
    end if

    if m.teamIndex < 0
        m.teamIndex = 0
    else
        m.teamIndex = (m.teamIndex + delta + n) mod n
    end if
    m.teamId = m.teams[m.teamIndex].id
    saveSetting("teamId", m.teamId)

    showStatus(m.teams[m.teamIndex].name, "0xFFFFFFFF", false)

    ' Wait for a short pause so flipping through several teams only takes
    ' one picture
    m.teamChangeTimer.control = "stop"
    m.teamChangeTimer.control = "start"
end sub

sub onTeamChangeTimer()
    requestSnapshot()
end sub

' ── Pictures ─────────────────────────────────────────────────────────────

sub requestSnapshot()
    m.requestId = m.requestId + 1

    url = m.siteUrl + "/api/display-snapshot"
    if m.teamId <> "" then url = url + "?team=" + m.teamId

    task = CreateObject("roSGNode", "SnapshotTask")
    task.url = url
    task.file = "tmp:/workout_" + m.requestId.ToStr() + ".jpg"
    task.requestId = m.requestId
    ' Remove the picture from two requests ago (the one before the current
    ' one stays until the new picture is on screen)
    if m.requestId > 2 then task.oldFile = "tmp:/workout_" + (m.requestId - 2).ToStr() + ".jpg"
    task.ObserveField("status", "onSnapshotDone")
    task.control = "RUN"
    m.snapshotTask = task

    showStatus("Updating" + currentTeamSuffix() + "...", "0xFFFFFFFF", false)
end sub

sub onSnapshotDone(event as object)
    task = event.GetRoSGNode()
    if task.requestId <> m.requestId then return   ' an older request; a newer one is on its way

    if task.status = "ok"
        ' First run: the site picked a team with a workout today; follow it
        if m.teamId = "" and task.teamId <> ""
            m.teamId = task.teamId
            saveSetting("teamId", m.teamId)
            for i = 0 to m.teams.Count() - 1
                if m.teams[i].id = m.teamId then m.teamIndex = i
            end for
        end if

        m.loadingFile = task.file
        m.loadingClips = []
        if task.clips <> invalid then m.loadingClips = task.clips
        back = 0
        if m.front = 0 then back = 1
        m.posters[back].uri = task.file
    else
        reason = ""
        if task.errorText <> "" then reason = " (" + task.errorText + ")"
        showStatus("Couldn't update" + reason + ". Press Replay.", "0xF97316FF", false)
        if m.front = -1 then m.firstLoadText.text = "Couldn't load the workout" + reason + ". Press Replay to try again."
    end if
end sub

sub onPosterLoadStatus(event as object)
    p = event.GetRoSGNode()
    if p.loadStatus = "ready" and p.uri = m.loadingFile
        ' Swap: show the freshly loaded picture, hide the old one
        for i = 0 to 1
            if m.posters[i].isSameNode(p)
                m.posters[i].visible = true
                m.front = i
            else
                m.posters[i].visible = false
            end if
        end for
        m.firstLoad.visible = false
        m.lastFile = m.loadingFile
        ' The new picture's clips replace the old picture's clips
        m.clips = m.loadingClips
        m.clipIndex = 0
        m.clipFails = 0
        startClips()
        if m.todayOnly
            showStatus("Updated" + currentTeamSuffix(), "0x22C55EFF", true)
        else
            showStatus("No team has a workout today", "0xFBBF24FF", true)
        end if
    else if p.loadStatus = "failed" and p.uri = m.loadingFile
        showStatus("Couldn't show the picture. Press Replay.", "0xF97316FF", false)
    end if
end sub

function currentTeamSuffix() as string
    if m.teamIndex >= 0 and m.teamIndex < m.teams.Count()
        return ": " + m.teams[m.teamIndex].name
    end if
    return ""
end function

' ── Leaderboard ──────────────────────────────────────────────────────────

sub openLeaderboard()
    if m.leaderboard <> invalid then return
    view = CreateObject("roSGNode", "LeaderboardView")
    view.backGoesToMenu = true
    view.ObserveField("exitRequested", "onLeaderboardExit")
    m.top.appendChild(view)
    view.setFocus(true)
    m.leaderboard = view
    stopClips()   ' no need to stream clips behind the leaderboard
end sub

sub onLeaderboardExit()
    if m.leaderboard <> invalid
        m.leaderboard.active = false
        m.top.removeChild(m.leaderboard)
        m.leaderboard = invalid
    end if
    m.top.setFocus(true)
    m.clipFails = 0
    startClips()
end sub

' ── Demo clips ───────────────────────────────────────────────────────────

' Plays the clip at m.clipIndex (if the picture has any clips)
sub startClips()
    stopClips()
    if m.clips.Count() = 0 or m.leaderboard <> invalid then return
    if m.clipIndex < 0 or m.clipIndex >= m.clips.Count() then m.clipIndex = 0
    c = m.clips[m.clipIndex]

    ' The picture is 1920x1080; this screen is 1280x720
    m.clipVideo.translation = [Int(c.x * 2 / 3), Int(c.y * 2 / 3)]
    m.clipVideo.width = Int(c.w * 2 / 3)
    m.clipVideo.height = Int(c.h * 2 / 3)

    content = CreateObject("roSGNode", "ContentNode")
    content.url = c.url
    content.streamFormat = "mp4"
    m.clipVideo.content = content
    m.clipVideo.control = "play"
end sub

sub stopClips()
    m.clipTimer.control = "stop"
    m.clipVideo.visible = false
    m.clipVideo.control = "stop"
end sub

' Move to another clip (delta 1 = next, -1 = previous)
sub moveClip(delta as integer)
    n = m.clips.Count()
    if n = 0 then return
    m.clipIndex = (m.clipIndex + delta + n) mod n
    startClips()
end sub

sub onClipState()
    state = m.clipVideo.state
    if state = "playing"
        m.clipFails = 0
        m.clipVideo.visible = true
        ' With one clip there's nothing to move on to; it just loops
        if not m.clipHold and m.clips.Count() > 1
            m.clipTimer.control = "stop"
            m.clipTimer.control = "start"
        end if
    else if state = "error"
        ' This clip won't play here: leave its still picture up and try the
        ' next one. Stop once every clip has failed, so it doesn't keep trying.
        m.clipVideo.visible = false
        m.clipFails = m.clipFails + 1
        if m.clipFails < m.clips.Count() then moveClip(1)
    end if
end sub

sub onClipTimer()
    if not m.clipHold then moveClip(1)
end sub

sub toggleClipHold()
    if m.clips.Count() = 0
        showStatus("No demo clips in this workout", "0xFFFFFFFF", true)
        return
    end if
    m.clipHold = not m.clipHold
    if m.clipHold
        m.clipTimer.control = "stop"
        showStatus("Holding on this clip (Play to continue)", "0xFFFFFFFF", true)
    else
        m.clipTimer.control = "stop"
        m.clipTimer.control = "start"
        showStatus("Cycling through clips", "0xFFFFFFFF", true)
    end if
end sub

' ── Remote ───────────────────────────────────────────────────────────────

function onKeyEvent(key as string, press as boolean) as boolean
    if not press then return false
    if m.leaderboard <> invalid then return false   ' leaderboard handles its own keys

    if key = "left"
        changeTeam(-1)
        return true
    else if key = "right"
        changeTeam(1)
        return true
    else if key = "replay"
        ' Refresh today's team list too, in case the schedule changed
        m.teamChangeTimer.control = "stop"
        loadTeams(true)
        return true
    else if key = "OK"
        openLeaderboard()
        return true
    else if key = "play"
        toggleClipHold()
        return true
    else if key = "fastforward"
        m.clipFails = 0
        moveClip(1)
        return true
    else if key = "rewind"
        m.clipFails = 0
        moveClip(-1)
        return true
    else if key = "options"
        showHint()
        return true
    end if

    ' Back (and anything else) is not handled here, so Back exits the app
    return false
end function

' ── Status note and help bar ─────────────────────────────────────────────

sub showStatus(text as string, color as string, autoHide as boolean)
    m.statusText.text = text
    m.statusText.color = color
    m.statusNote.visible = true
    m.statusTimer.control = "stop"
    if autoHide then m.statusTimer.control = "start"
end sub

sub onStatusTimer()
    m.statusNote.visible = false
end sub

sub showHint()
    m.hint.visible = true
    m.hintTimer.control = "stop"
    m.hintTimer.control = "start"
end sub

sub onHintTimer()
    m.hint.visible = false
end sub

' ── Saved settings ───────────────────────────────────────────────────────

function readSetting(key as string) as string
    value = ""
    try
        section = CreateObject("roRegistrySection", "vortexTv2")
        if section.Exists(key) then value = section.Read(key)
    catch e
    end try
    return value
end function

sub saveSetting(key as string, value as string)
    try
        section = CreateObject("roRegistrySection", "vortexTv2")
        section.Write(key, value)
        section.Flush()
    catch e
    end try
end sub
