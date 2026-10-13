' FILE: components/AppScene.brs  (Vortex Scoreboard + Leaderboard)
'
' Shows the launch menu and hosts the chosen display:
'   Scoreboard  - the original scoreboard (MainScene), controls unchanged.
'                 Back still resets scores, so to leave it press Home and
'                 reopen the app.
'   Leaderboard - LeaderboardView. Left/Right change page; Back (or OK)
'                 returns to this menu.
' The menu starts on whichever display was used last.

sub init()
    m.top.backgroundColor = "0x0B1220FF"
    m.top.backgroundUri = ""

    m.menu = m.top.findNode("menu")
    m.frames = [m.top.findNode("frame0"), m.top.findNode("frame1")]
    m.tiles = [m.top.findNode("tile0"), m.top.findNode("tile1")]
    m.modes = ["scoreboard", "leaderboard"]

    m.selected = 0
    if readLastMode() = "leaderboard" then m.selected = 1

    m.mode = "menu"
    m.current = invalid
    updateMenu()
    m.top.setFocus(true)
end sub

sub updateMenu()
    for i = 0 to 1
        if i = m.selected
            m.frames[i].color = "0x2A9D8FFF"
            m.tiles[i].color = "0x1B2E52FF"
        else
            m.frames[i].color = "0x00000000"
            m.tiles[i].color = "0x14213DFF"
        end if
    end for
end sub

sub openMode(mode as string)
    saveLastMode(mode)
    m.menu.visible = false

    if mode = "scoreboard"
        view = CreateObject("roSGNode", "MainScene")
    else
        view = CreateObject("roSGNode", "LeaderboardView")
        view.backGoesToMenu = true
        view.ObserveField("exitRequested", "onLeaderboardExit")
    end if

    m.top.appendChild(view)
    view.setFocus(true)
    m.current = view
    m.mode = mode
end sub

sub onLeaderboardExit()
    if m.current <> invalid
        m.current.active = false
        m.top.removeChild(m.current)
        m.current = invalid
    end if
    m.mode = "menu"
    m.menu.visible = true
    updateMenu()
    m.top.setFocus(true)
end sub

function onKeyEvent(key as string, press as boolean) as boolean
    ' Only the menu is handled here; the displays handle their own keys
    if m.mode <> "menu" or not press then return false

    if key = "left" or key = "up"
        m.selected = 0
        updateMenu()
        return true
    else if key = "right" or key = "down"
        m.selected = 1
        updateMenu()
        return true
    else if key = "OK"
        openMode(m.modes[m.selected])
        return true
    end if

    ' Back is not handled, so it exits the app from the menu
    return false
end function

function readLastMode() as string
    value = ""
    try
        section = CreateObject("roRegistrySection", "vortex")
        if section.Exists("lastMode") then value = section.Read("lastMode")
    catch e
    end try
    return value
end function

sub saveLastMode(mode as string)
    try
        section = CreateObject("roRegistrySection", "vortex")
        section.Write("lastMode", mode)
        section.Flush()
    catch e
    end try
end sub
