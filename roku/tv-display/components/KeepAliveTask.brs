' FILE: components/KeepAliveTask.brs  (Vortex TV Display)
' Every 30 seconds, tells the Roku a button was pressed so the screensaver
' never starts while the workout or leaderboard is up.

sub init()
    m.top.functionName = "runKeepAlive"
end sub

sub runKeepAlive()
    appManager = CreateObject("roAppManager")
    while true
        appManager.UpdateLastKeyPressTime()
        sleep(30000)
    end while
end sub
