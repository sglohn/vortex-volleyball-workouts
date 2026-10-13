' FILE: components/SnapshotTask.brs  (Vortex TV Display)
' Asks the site for a fresh picture of the TV Display page and saves it to
' m.top.file. Taking the picture can take 5-30 seconds on the site's side,
' so this waits up to 90 seconds. On failure, errorText says why, so the
' reason can be shown on screen.
'
' The site also sends an X-Clips header: where each exercise demo clip sits
' in the picture (Base64 of JSON). It's read into m.top.clips.

sub init()
    m.top.functionName = "downloadSnapshot"
end sub

sub downloadSnapshot()
    ' Clean up an older picture so temporary storage doesn't fill up
    if m.top.oldFile <> "" then DeleteFile(m.top.oldFile)

    port = CreateObject("roMessagePort")
    xfer = CreateObject("roUrlTransfer")
    xfer.SetMessagePort(port)
    xfer.SetCertificatesFile("common:/certs/ca-bundle.crt")
    xfer.InitClientCertificates()
    xfer.SetUrl(m.top.url)

    if not xfer.AsyncGetToFile(m.top.file)
        m.top.errorText = "couldn't start download"
        m.top.status = "error"
        return
    end if

    msg = wait(90000, port)
    if type(msg) <> "roUrlEvent"
        xfer.AsyncCancel()
        m.top.errorText = "timed out"
        m.top.status = "error"
        return
    end if

    code = msg.GetResponseCode()
    if code = 200
        headers = msg.GetResponseHeaders()
        if headers <> invalid and headers["x-team-id"] <> invalid
            m.top.teamId = headers["x-team-id"]
        end if
        m.top.clips = readClips(headers)
        m.top.status = "ok"
    else if code < 0
        m.top.errorText = "network: " + msg.GetFailureReason()
        m.top.status = "error"
    else
        m.top.errorText = "site error " + code.ToStr()
        m.top.status = "error"
    end if
end sub

' Reads the X-Clips header. Anything unexpected gives an empty list, so the
' picture still shows without clips.
function readClips(headers as object) as object
    result = []
    if headers = invalid or headers["x-clips"] = invalid then return result
    try
        bytes = CreateObject("roByteArray")
        bytes.FromBase64String(headers["x-clips"])
        list = ParseJson(bytes.ToAsciiString())
        if type(list) = "roArray"
            for each c in list
                if type(c) = "roAssociativeArray" and c.url <> invalid and c.x <> invalid and c.y <> invalid and c.w <> invalid and c.h <> invalid
                    result.Push({ url: c.url, x: c.x, y: c.y, w: c.w, h: c.h })
                end if
            end for
        end if
    catch e
    end try
    return result
end function
