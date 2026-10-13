' Runs in the background (its own Task thread) and periodically tells
' the Roku OS "a button was just pressed" so the system screensaver
' never thinks the app has gone idle - even during long stretches of
' play where nobody is touching the remote.
sub init()
    m.top.functionName = "runKeepAlive"
end sub

sub runKeepAlive()
    appManager = CreateObject("roAppManager")
    while true
        appManager.UpdateLastKeyPressTime()
        sleep(30000)   ' every 30 seconds - comfortably under any screensaver timeout
    end while
end sub
