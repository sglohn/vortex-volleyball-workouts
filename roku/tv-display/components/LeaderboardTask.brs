' FILE: components/LeaderboardTask.brs  (Vortex Weight Room Leaderboard)
' Polls /api/leaderboard and hands the parsed JSON to LeaderboardView.
' Adds &page=N while a page is held with the remote, and fetches right away
' when refreshNow is set. Stops when its "active" field is set to false.

sub init()
    m.top.functionName = "pollLeaderboard"
end sub

sub pollLeaderboard()
    info = CreateObject("roAppInfo")
    url = info.GetValue("leaderboard_url")
    pollSeconds = Val(info.GetValue("poll_seconds"))
    if pollSeconds < 2 then pollSeconds = 5

    separator = "?"
    if Instr(1, url, "?") > 0 then separator = "&"

    port = CreateObject("roMessagePort")
    clock = CreateObject("roDateTime")
    appManager = CreateObject("roAppManager")

    while m.top.active
        m.top.refreshNow = false
        page = m.top.pinnedPage

        clock.Mark()
        xfer = CreateObject("roUrlTransfer")
        xfer.SetMessagePort(port)
        xfer.SetCertificatesFile("common:/certs/ca-bundle.crt")
        xfer.InitClientCertificates()
        xfer.RetainBodyOnError(true)
        ' Cache-buster so nothing in between serves an old copy
        requestUrl = url + separator + "t=" + clock.AsSeconds().ToStr()
        if page > 0 then requestUrl = requestUrl + "&page=" + page.ToStr()
        xfer.SetUrl(requestUrl)

        ok = false
        if xfer.AsyncGetToString()
            msg = wait(10000, port)
            if type(msg) = "roUrlEvent"
                if msg.GetResponseCode() = 200
                    json = ParseJson(msg.GetString())
                    if json <> invalid
                        ' Lets the view skip replies meant for a page it has moved past
                        json.requestedPage = page
                        m.top.data = json
                        ok = true
                    end if
                end if
            else
                xfer.AsyncCancel()
            end if
        end if

        if ok
            m.top.status = "ok"
        else
            m.top.status = "error"
        end if

        ' Counts as remote activity so the screensaver never covers the board
        appManager.UpdateLastKeyPressTime()

        ' Sleep in short steps so a button press or closing the view is quick
        waited = 0
        while waited < pollSeconds * 1000 and m.top.active and not m.top.refreshNow
            sleep(100)
            waited = waited + 100
        end while
    end while
end sub
