local foo = ngx.req.get_headers()["foo"]

local sock = ngx.socket.tcp()
local ok, err = sock:connect("127.0.0.1", 8080)
if not ok then
    ngx.say("failed to connect to google: ", err)
    return
end

sock:settimeout(1000)  -- one second timeout
local bytes, err = sock:send(string.format('addproc %s "ttyd -i /run/ttyd/%s.sock fish" False False .\n', foo, foo))

if err then
    ngx.say("failed to write: ", err)
    return
end

local line, err, partial = sock:receive('*a')
if not line then
    ngx.say("failed to read a line: ", err, partial)
    return
end
ngx.say("successfully read a line: ", line)
sock:close()


local sock = ngx.socket.tcp()
local ok, err = sock:connect("127.0.0.1", 8080)
if not ok then
    ngx.say("failed to connect to google: ", err)
    return
end

sock:settimeout(1000)  -- one second timeout
-- local bytes, err = sock:send(string.format('addproc %s "ttyd -i /run/%s.sock" False False .\n', foo, foo))
local bytes, err = sock:send(string.format('startproc %s\n', foo))

if err then
    ngx.say("failed to write: ", err)
    return
end

local line, err, partial = sock:receive('*a')
if not line then
    ngx.say("failed to read a line: ", err, partial)
    return
end
ngx.say("successfully read a line: ", line)
sock:close()

-- Successfully added process
-- Error: There is already a process named

-- Warning: Process was already running, so nothing was done
-- Successfully started process