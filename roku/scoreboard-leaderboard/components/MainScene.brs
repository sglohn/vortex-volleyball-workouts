' ============================================================
' FILE: roku/scoreboard-leaderboard/components/MainScene.brs
' Volleyball Scoreboard - main logic  (v2.3.0)
'
' FOCUS CYCLES THROUGH 5 STOPS (Left/Right):
'   0 = Team A score      1 = Team A sets
'   2 = Timer              3 = Team B score
'   4 = Team B sets
'
' Controls:
'   Left / Right   - move focus between the 5 stops above
'   Up / Down      - score focused:  +1 / -1 point
'                    sets focused:   +1 / -1 (a free counter,
'                                    handy for practice drills too)
'                    timer focused:  +5s / -5s to the timer,
'                                    adjusting it live even while running
'   Play/Pause     - start / pause the timer (works from anywhere)
'   OK             - team focused:  open the rename keyboard
'                    timer focused: reset the timer to its length;
'                                   if it's already reset, jump to the
'                                   next preset length (0:30, 1:00, 2:00,
'                                   3:00, 5:00, 10:00, then back to 0:30)
'   Replay         - UNDO the last change to scores / sets (works from
'                     anywhere; remembers the last 20 changes, including
'                     a score reset or full reset)
'   Rewind         - +1 point to the LEFT team, no need to navigate
'   Fast Forward   - +1 point to the RIGHT team, no need to navigate
'   Options ( * )  - team focused:  +1 to that team's sets counter
'                                   (score is never touched)
'                    timer focused: full reset - scores, sets, AND
'                                   the timer, all back to zero
'   Back           - press TWICE (within 3 seconds) to reset SCORES
'                     to 0-0. The first press only shows a message.
'                     While the rename keyboard is open, Back instead
'                     cancels the rename.
'
' Serve arrow: points at the team that won the last point (Up on a
' score, Rewind or Fast Forward). Hidden after a score reset until the
' next point. Down on a score doesn't move it; Undo puts it back.
'
' Saved score: scores, sets, team names, serve and the timer length are
' saved on the Roku after every change, so closing the app, pressing
' Home or a power loss doesn't lose the match. Reopening the app puts
' everything back (the timer comes back paused at its full length).
' ============================================================

sub init()
    m.panelA = m.top.findNode("panelA")
    m.panelB = m.top.findNode("panelB")
    m.panelTimer = m.top.findNode("panelTimer")
    m.scoreAFrame = m.top.findNode("scoreAFrame")
    m.setsAFrame = m.top.findNode("setsAFrame")
    m.scoreBFrame = m.top.findNode("scoreBFrame")
    m.setsBFrame = m.top.findNode("setsBFrame")

    m.scoreATens = m.top.findNode("scoreATens")
    m.scoreAOnes = m.top.findNode("scoreAOnes")
    m.scoreBTens = m.top.findNode("scoreBTens")
    m.scoreBOnes = m.top.findNode("scoreBOnes")
    m.labelTeamASets = m.top.findNode("labelTeamASets")
    m.labelTeamBSets = m.top.findNode("labelTeamBSets")

    m.timerMinTens = m.top.findNode("timerMinTens")
    m.timerMinOnes = m.top.findNode("timerMinOnes")
    m.timerSecTens = m.top.findNode("timerSecTens")
    m.timerSecOnes = m.top.findNode("timerSecOnes")

    m.serveGroup = m.top.findNode("serveGroup")
    m.serveArrow = m.top.findNode("serveArrow")

    m.toastGroup = m.top.findNode("toastGroup")
    m.toastLabel = m.top.findNode("toastLabel")
    m.toastTimer = m.top.findNode("toastTimer")
    m.toastTimer.observeField("fire", "onToastTimeout")

    ' layout constants for the two-digit image-based score display
    m.digitWidth = 191
    m.digitHeight = 275
    m.digitGap = 20
    m.digitY = 295
    m.panelAX = 40
    m.panelBX = 720
    m.panelWidth = 520

    ' layout constants for the image-based team name display
    m.nameCellHeight = 100
    m.nameCellMaxWidth = 75
    m.nameAvailableWidth = 500
    m.nameY = 178
    m.nameMaxChars = 8

    buildNameGlyphs()

    m.hornAudio = m.top.findNode("hornAudio")
    hornContent = CreateObject("roSGNode", "ContentNode")
    hornContent.url = "pkg:/sounds/horn.wav"
    m.hornAudio.content = hornContent

    m.keepAliveTask = CreateObject("roSGNode", "KeepAliveTask")
    m.keepAliveTask.control = "RUN"

    m.countdownTimer = m.top.findNode("countdownTimer")
    m.countdownTimer.observeField("fire", "onTimerTick")

    ' ---- state ----
    m.scoreA = 0
    m.scoreB = 0
    m.setsA = 0
    m.setsB = 0
    m.server = ""          ' "A", "B", or "" (no arrow)
    m.teamAName = "HOME"
    m.teamBName = "AWAY"
    m.timerDuration = 60   ' default length in seconds - change here if you want a different default
    m.timerPresets = [30, 60, 120, 180, 300, 600]   ' lengths OK steps through on the timer
    m.timerRunning = false
    m.focusIndex = 0       ' 0=Score A, 1=Sets A, 2=Timer, 3=Score B, 4=Sets B

    m.history = []         ' undo snapshots, newest last
    m.historyMax = 20
    m.backArmed = false    ' true for 3 seconds after the first Back press
    m.lastSaved = ""

    loadState()
    m.timerRemaining = m.timerDuration
    m.lastSaved = stateJson()

    buildKeyboard()
    m.keyboardOpen = false

    m.top.setFocus(true)
    updateDisplay()
end sub

sub renderScore(tensNode as object, onesNode as object, panelX as integer, score as integer)
    ' clamp to a 2-digit display (0-99) - volleyball scores won't realistically exceed this
    displayScore = score
    if displayScore > 99 then displayScore = 99

    ones = displayScore mod 10
    tens = displayScore \ 10

    onesNode.uri = "pkg:/images/digit_" + ones.ToStr() + ".png"

    if tens > 0
        tensNode.uri = "pkg:/images/digit_" + tens.ToStr() + ".png"
        tensNode.visible = true
        pairWidth = (m.digitWidth * 2) + m.digitGap
        startX = panelX + ((m.panelWidth - pairWidth) / 2)
        tensNode.translation = [startX, m.digitY]
        onesNode.translation = [startX + m.digitWidth + m.digitGap, m.digitY]
    else
        tensNode.visible = false
        singleX = panelX + ((m.panelWidth - m.digitWidth) / 2)
        onesNode.translation = [singleX, m.digitY]
    end if
end sub

sub renderTimerDigits()
    remaining = m.timerRemaining
    if remaining < 0 then remaining = 0
    mins = remaining \ 60
    secs = remaining mod 60
    if mins > 99 then mins = 99   ' guard against absurd durations

    prefix = "pkg:/images/timerdigit_"
    if m.timerRunning then prefix = "pkg:/images/timerdigit_running_"

    m.timerMinTens.uri = prefix + (mins \ 10).ToStr() + ".png"
    m.timerMinOnes.uri = prefix + (mins mod 10).ToStr() + ".png"
    m.timerSecTens.uri = prefix + (secs \ 10).ToStr() + ".png"
    m.timerSecOnes.uri = prefix + (secs mod 10).ToStr() + ".png"

    dotColor = "0xFFD166FF"
    if m.timerRunning then dotColor = "0x8BE38FFF"
    m.top.findNode("timerColonDot1").color = dotColor
    m.top.findNode("timerColonDot2").color = dotColor
end sub

sub renderServe()
    if m.server = "A"
        m.serveArrow.uri = "pkg:/images/serve_left.png"
        m.serveGroup.visible = true
    else if m.server = "B"
        m.serveArrow.uri = "pkg:/images/serve_right.png"
        m.serveGroup.visible = true
    else
        m.serveGroup.visible = false
    end if
end sub

sub buildNameGlyphs()
    groupA = m.top.findNode("nameAGlyphGroup")
    groupB = m.top.findNode("nameBGlyphGroup")

    m.nameAGlyphs = []
    m.nameBGlyphs = []

    for i = 0 to m.nameMaxChars - 1
        posterA = groupA.createChild("Poster")
        posterA.height = m.nameCellHeight
        m.nameAGlyphs.Push(posterA)

        posterB = groupB.createChild("Poster")
        posterB.height = m.nameCellHeight
        m.nameBGlyphs.Push(posterB)
    end for
end sub

function uriForNameChar(ch as string) as string
    if ch >= "0" and ch <= "9"
        return "pkg:/images/digit_" + ch + ".png"
    else if ch = " "
        return "pkg:/images/letter_SP.png"
    else
        return "pkg:/images/letter_" + ch + ".png"
    end if
end function

sub renderTeamName(glyphNodes as object, panelX as integer, name as string)
    length = Len(name)
    if length < 1 then length = 1

    cellWidth = m.nameAvailableWidth / length
    if cellWidth > m.nameCellMaxWidth then cellWidth = m.nameCellMaxWidth

    totalWidth = cellWidth * length
    startX = panelX + ((m.panelWidth - totalWidth) / 2)

    for i = 0 to m.nameMaxChars - 1
        node = glyphNodes[i]
        if i < length
            ch = Mid(name, i + 1, 1)
            node.visible = true
            node.width = cellWidth
            node.uri = uriForNameChar(ch)
            node.translation = [ startX + (i * cellWidth), m.nameY ]
        else
            node.visible = false
        end if
    end for
end sub

sub updateDisplay()
    renderScore(m.scoreATens, m.scoreAOnes, m.panelAX, m.scoreA)
    renderScore(m.scoreBTens, m.scoreBOnes, m.panelBX, m.scoreB)
    renderTeamName(m.nameAGlyphs, m.panelAX, m.teamAName)
    renderTeamName(m.nameBGlyphs, m.panelBX, m.teamBName)
    m.labelTeamASets.text = "SETS WON: " + m.setsA.ToStr()
    m.labelTeamBSets.text = "SETS WON: " + m.setsB.ToStr()
    renderTimerDigits()
    renderServe()

    panelUnfocused = "0x14213DFF"
    panelActive = "0x1B2E52FF"
    timerUnfocused = "0x1F2A44FF"
    timerFocused = "0x2A9D8FFF"
    frameOff = "0x00000000"
    frameOn = "0x2A9D8FFF"

    ' which team (if any) currently owns focus, for the subtler whole-panel tint
    teamAActive = (m.focusIndex = 0 or m.focusIndex = 1)
    teamBActive = (m.focusIndex = 3 or m.focusIndex = 4)

    if teamAActive then m.panelA.color = panelActive else m.panelA.color = panelUnfocused
    if teamBActive then m.panelB.color = panelActive else m.panelB.color = panelUnfocused

    if m.focusIndex = 2 then m.panelTimer.color = timerFocused else m.panelTimer.color = timerUnfocused

    if m.focusIndex = 0 then m.scoreAFrame.color = frameOn else m.scoreAFrame.color = frameOff
    if m.focusIndex = 1 then m.setsAFrame.color = frameOn else m.setsAFrame.color = frameOff
    if m.focusIndex = 3 then m.scoreBFrame.color = frameOn else m.scoreBFrame.color = frameOff
    if m.focusIndex = 4 then m.setsBFrame.color = frameOn else m.setsBFrame.color = frameOff
end sub

' ============================================================
' Message box (toast) - shows for 3 seconds
' ============================================================

sub showToast(text as string)
    m.toastLabel.text = text
    m.toastGroup.visible = true
    m.toastTimer.control = "stop"
    m.toastTimer.control = "start"
end sub

sub hideToast()
    m.toastTimer.control = "stop"
    m.toastGroup.visible = false
    m.backArmed = false
end sub

sub onToastTimeout()
    m.toastGroup.visible = false
    m.backArmed = false
end sub

' ============================================================
' Points, undo and saving
' ============================================================

' Save a copy of scores/sets/serve BEFORE changing them, so Replay can undo it
sub pushHistory()
    m.history.Push({ scoreA: m.scoreA, scoreB: m.scoreB, setsA: m.setsA, setsB: m.setsB, server: m.server })
    while m.history.Count() > m.historyMax
        m.history.Shift()
    end while
end sub

sub undoLast()
    if m.history.Count() = 0
        showToast("Nothing to undo")
        return
    end if
    snap = m.history.Pop()
    m.scoreA = snap.scoreA
    m.scoreB = snap.scoreB
    m.setsA = snap.setsA
    m.setsB = snap.setsB
    m.server = snap.server
    showToast("Undone")
end sub

sub addPoint(team as string)
    pushHistory()
    if team = "A" then m.scoreA = m.scoreA + 1 else m.scoreB = m.scoreB + 1
    m.server = team
end sub

sub removePoint(team as string)
    if team = "A"
        if m.scoreA = 0 then return
        pushHistory()
        m.scoreA = m.scoreA - 1
    else
        if m.scoreB = 0 then return
        pushHistory()
        m.scoreB = m.scoreB - 1
    end if
end sub

sub changeSets(team as string, delta as integer)
    if team = "A"
        if m.setsA + delta < 0 then return
        pushHistory()
        m.setsA = m.setsA + delta
    else
        if m.setsB + delta < 0 then return
        pushHistory()
        m.setsB = m.setsB + delta
    end if
end sub

function stateJson() as string
    state = {}
    state.scoreA = m.scoreA
    state.scoreB = m.scoreB
    state.setsA = m.setsA
    state.setsB = m.setsB
    state.server = m.server
    state.teamAName = m.teamAName
    state.teamBName = m.teamBName
    state.timerDuration = m.timerDuration
    return FormatJson(state)
end function

' Writes to the Roku only when something actually changed (not every timer tick)
sub saveIfChanged()
    json = stateJson()
    if json = m.lastSaved then return
    try
        section = CreateObject("roRegistrySection", "vortexScoreboard")
        section.Write("state", json)
        section.Flush()
        m.lastSaved = json
    catch e
    end try
end sub

function toWholeNumber(value as dynamic, fallback as integer, minValue as integer) as integer
    t = Type(value)
    if t <> "roInt" and t <> "roInteger" and t <> "Integer" and t <> "roFloat" and t <> "Float" and t <> "Double" and t <> "roDouble" and t <> "LongInteger" and t <> "roLongInteger" then return fallback
    n = Int(value)
    if n < minValue then return fallback
    return n
end function

function toName(value as dynamic, fallback as string) as string
    t = Type(value)
    if t <> "roString" and t <> "String" then return fallback
    if value = "" or Len(value) > m.nameMaxChars then return fallback
    return value
end function

sub loadState()
    try
        section = CreateObject("roRegistrySection", "vortexScoreboard")
        saved = invalid
        if section.Exists("state") then saved = ParseJson(section.Read("state"))
        if saved <> invalid and Type(saved) = "roAssociativeArray" then applySavedState(saved)
    catch e
    end try
end sub

sub applySavedState(saved as object)
    m.scoreA = toWholeNumber(saved.scoreA, 0, 0)
    m.scoreB = toWholeNumber(saved.scoreB, 0, 0)
    m.setsA = toWholeNumber(saved.setsA, 0, 0)
    m.setsB = toWholeNumber(saved.setsB, 0, 0)
    m.timerDuration = toWholeNumber(saved.timerDuration, 60, 5)
    m.teamAName = toName(saved.teamAName, "HOME")
    m.teamBName = toName(saved.teamBName, "AWAY")
    if saved.server = "A" or saved.server = "B" then m.server = saved.server else m.server = ""
end sub

' ============================================================
' Timer
' ============================================================

sub onTimerTick()
    if m.timerRunning
        m.timerRemaining = m.timerRemaining - 1
        if m.timerRemaining <= 0
            m.timerRemaining = 0
            m.timerRunning = false
            m.countdownTimer.control = "stop"
            m.hornAudio.control = "play"
        end if
        updateDisplay()
    end if
end sub

sub startTimer()
    m.timerRunning = true
    if m.timerRemaining <= 0 then m.timerRemaining = m.timerDuration
    m.countdownTimer.control = "start"
end sub

sub pauseTimer()
    m.timerRunning = false
    m.countdownTimer.control = "stop"
end sub

sub toggleTimer()
    if m.timerRunning then pauseTimer() else startTimer()
end sub

sub resetTimer()
    pauseTimer()
    m.timerRemaining = m.timerDuration
end sub

' OK on the timer: first press resets it to its length; if it's already
' reset (paused at full length), step to the next preset length instead
sub timerOkPressed()
    if m.timerRunning or m.timerRemaining <> m.timerDuration
        resetTimer()
        return
    end if

    nextLength = m.timerPresets[0]
    for each preset in m.timerPresets
        if preset > m.timerDuration
            nextLength = preset
            exit for
        end if
    end for
    m.timerDuration = nextLength
    m.timerRemaining = nextLength
end sub

' adjusts the timer live, by deltaSeconds (positive or negative) - this
' becomes the new "reset to" baseline too, so OK on the timer returns to it
sub adjustTimer(deltaSeconds as integer)
    m.timerDuration = m.timerDuration + deltaSeconds
    if m.timerDuration < 5 then m.timerDuration = 5
    m.timerRemaining = m.timerRemaining + deltaSeconds
    if m.timerRemaining < 0 then m.timerRemaining = 0
    if m.timerRemaining > m.timerDuration then m.timerRemaining = m.timerDuration
end sub

sub resetScoresOnly()
    pushHistory()
    m.scoreA = 0
    m.scoreB = 0
    m.server = ""
end sub

sub resetEverything()
    pushHistory()
    m.scoreA = 0
    m.scoreB = 0
    m.setsA = 0
    m.setsB = 0
    m.server = ""
    resetTimer()
end sub

' ============================================================
' On-screen keyboard for renaming a team - plain preset-font
' Labels only (no custom Font sizes), since that's what actually
' renders reliably on this hardware.
' ============================================================

sub buildKeyboard()
    overlay = m.top.findNode("keyboardOverlay")

    m.kbRows = [ ["A","B","C","D","E","F","G","H"], ["I","J","K","L","M","N","O","P"], ["Q","R","S","T","U","V","W","X"], ["Y","Z","0","1","2","3","4","5"], ["6","7","8","9","SP","DEL","OK",""] ]

    m.kbCellWidth = 110
    m.kbCellHeight = 70
    m.kbGridLeft = 200
    m.kbGridTop = 230
    m.kbMaxNameLength = 8   ' kept short since the name now renders at a much larger font

    m.kbCellNodes = []
    for row = 0 to 4
        rowNodes = []
        for col = 0 to 7
            lbl = overlay.createChild("Label")
            lbl.text = m.kbRows[row][col]
            lbl.width = m.kbCellWidth - 10
            lbl.height = m.kbCellHeight - 10
            lbl.horizAlign = "center"
            lbl.vertAlign = "center"
            lbl.font = "font:MediumBoldSystemFont"
            lbl.color = "0xAAB4C8FF"
            lbl.translation = [ m.kbGridLeft + (col * m.kbCellWidth) + 5, m.kbGridTop + (row * m.kbCellHeight) + 5 ]
            rowNodes.Push(lbl)
        end for
        m.kbCellNodes.Push(rowNodes)
    end for

    m.kbNameDisplay = m.top.findNode("kbNameDisplay")
    m.kbTitle = m.top.findNode("kbTitle")
    m.keyboardOverlay = overlay
end sub

sub updateKbHighlight()
    for row = 0 to 4
        for col = 0 to 7
            node = m.kbCellNodes[row][col]
            if row = m.kbSelRow and col = m.kbSelCol
                node.color = "0xFFD166FF"
            else
                node.color = "0xAAB4C8FF"
            end if
        end for
    end for
end sub

sub updateKbNameDisplay()
    m.kbNameDisplay.text = m.editingName + "_"
end sub

sub openKeyboard(team as string)
    hideToast()
    m.keyboardOpen = true
    m.renamingTeam = team

    if team = "A"
        m.editingName = m.teamAName
        m.kbTitle.text = "ENTER NAME FOR LEFT TEAM"
    else
        m.editingName = m.teamBName
        m.kbTitle.text = "ENTER NAME FOR RIGHT TEAM"
    end if

    m.kbSelRow = 0
    m.kbSelCol = 0
    m.keyboardOverlay.visible = true
    updateKbNameDisplay()
    updateKbHighlight()
end sub

sub closeKeyboard(saveIt as boolean)
    if saveIt
        finalName = m.editingName
        if finalName = ""
            if m.renamingTeam = "A" then finalName = "HOME" else finalName = "AWAY"
        end if
        if m.renamingTeam = "A"
            m.teamAName = finalName
        else
            m.teamBName = finalName
        end if
        updateDisplay()
        saveIfChanged()
    end if

    m.keyboardOpen = false
    m.keyboardOverlay.visible = false
end sub

function handleKeyboardKey(key as string) as boolean
    handled = true

    if key = "up"
        m.kbSelRow = m.kbSelRow - 1
        if m.kbSelRow < 0 then m.kbSelRow = 4

    else if key = "down"
        m.kbSelRow = m.kbSelRow + 1
        if m.kbSelRow > 4 then m.kbSelRow = 0

    else if key = "left"
        m.kbSelCol = m.kbSelCol - 1
        if m.kbSelCol < 0 then m.kbSelCol = 7

    else if key = "right"
        m.kbSelCol = m.kbSelCol + 1
        if m.kbSelCol > 7 then m.kbSelCol = 0

    else if key = "OK"
        char = m.kbRows[m.kbSelRow][m.kbSelCol]
        if char = "DEL"
            if Len(m.editingName) > 0
                m.editingName = Left(m.editingName, Len(m.editingName) - 1)
            end if
        else if char = "SP"
            if Len(m.editingName) < m.kbMaxNameLength then m.editingName = m.editingName + " "
        else if char = "OK"
            closeKeyboard(true)
            return handled
        else if char <> ""
            if Len(m.editingName) < m.kbMaxNameLength then m.editingName = m.editingName + char
        end if
        updateKbNameDisplay()

    else if key = "back"
        closeKeyboard(false)

    else
        handled = false
    end if

    updateKbHighlight()
    return handled
end function

' ============================================================
' Remote buttons
' ============================================================

function onKeyEvent(key as string, press as boolean) as boolean
    if not press then return false

    if m.keyboardOpen
        return handleKeyboardKey(key)
    end if

    ' Any button other than Back cancels a half-done "press Back again"
    if m.backArmed and key <> "back" then hideToast()

    handled = true

    if key = "play" or key = "playpause"
        ' works from anywhere, regardless of focus
        toggleTimer()

    else if key = "rewind"
        ' instant point to the left team, no need to navigate there
        addPoint("A")

    else if key = "fastforward"
        ' instant point to the right team
        addPoint("B")

    else if key = "replay"
        ' undo, from anywhere
        undoLast()

    else if key = "left"
        m.focusIndex = m.focusIndex - 1
        if m.focusIndex < 0 then m.focusIndex = 4

    else if key = "right"
        m.focusIndex = m.focusIndex + 1
        if m.focusIndex > 4 then m.focusIndex = 0

    else if key = "up"
        if m.focusIndex = 0
            addPoint("A")
        else if m.focusIndex = 1
            changeSets("A", 1)
        else if m.focusIndex = 3
            addPoint("B")
        else if m.focusIndex = 4
            changeSets("B", 1)
        else
            adjustTimer(5)
        end if

    else if key = "down"
        if m.focusIndex = 0
            removePoint("A")
        else if m.focusIndex = 1
            changeSets("A", -1)
        else if m.focusIndex = 3
            removePoint("B")
        else if m.focusIndex = 4
            changeSets("B", -1)
        else
            adjustTimer(-5)
        end if

    else if key = "OK"
        if m.focusIndex = 0 or m.focusIndex = 1
            openKeyboard("A")
        else if m.focusIndex = 3 or m.focusIndex = 4
            openKeyboard("B")
        else
            timerOkPressed()
        end if

    else if key = "options" or key = "info" or key = "star"
        if m.focusIndex = 2
            ' timer focused - options becomes the full reset
            resetEverything()
            showToast("Everything reset - Replay to undo")
        else if m.focusIndex = 0 or m.focusIndex = 1
            changeSets("A", 1)
        else if m.focusIndex = 3 or m.focusIndex = 4
            changeSets("B", 1)
        else
            handled = false
        end if

    else if key = "back"
        if m.backArmed
            resetScoresOnly()
            showToast("Scores reset - Replay to undo")
            m.backArmed = false
        else
            showToast("Press Back again to reset scores")
            m.backArmed = true
        end if

    else
        handled = false
    end if

    updateDisplay()
    saveIfChanged()
    return handled
end function
