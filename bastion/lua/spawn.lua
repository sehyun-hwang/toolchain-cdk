local user_id = ngx.var.auth_congnito_identity_id:gsub("-", "_")
local process_id = string.format("user_id__%s", user_id)
local hmac_key = os.getenv("HMAC_KEY")

local sock = ngx.socket.tcp()
local ok, err = sock:connect("127.0.0.1", 8080)
if not ok then
    ngx.say("failed to connect to pypm: ", err)
    return
end

sock:settimeout(1000) -- one second timeout
local bytes, err = sock:send(string.format(
    'addproc %s "ttyd -i /run/ttyd/%s.sock -U nginx:nginx -W tmux new -As default" False False .\n',
    process_id, user_id))

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
    ngx.say("failed to connect to pypm: ", err)
    return
end

sock:settimeout(1000) -- one second timeout
local bytes, err = sock:send(string.format('startproc %s\n', process_id))

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

local src = string.format("%s:%d", user_id, ngx.time() / 10)
local digest = ngx.hmac_sha1(hmac_key, src)
ngx.say(ngx.md5(digest))

-- Successfully added process
-- Error: There is already a process named

-- Warning: Process was already running, so nothing was done
-- Successfully started process
