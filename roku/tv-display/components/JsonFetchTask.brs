' FILE: components/JsonFetchTask.brs  (Vortex TV Display)

sub init()
    m.top.functionName = "fetchJson"
end sub

sub fetchJson()
    port = CreateObject("roMessagePort")
    xfer = CreateObject("roUrlTransfer")
    xfer.SetMessagePort(port)
    xfer.SetCertificatesFile("common:/certs/ca-bundle.crt")
    xfer.InitClientCertificates()
    xfer.SetUrl(m.top.url)

    if xfer.AsyncGetToString()
        msg = wait(20000, port)
        if type(msg) = "roUrlEvent"
            if msg.GetResponseCode() = 200
                json = ParseJson(msg.GetString())
                if json <> invalid
                    m.top.data = json
                    m.top.status = "ok"
                    return
                end if
            end if
        else
            xfer.AsyncCancel()
        end if
    end if
    m.top.status = "error"
end sub
