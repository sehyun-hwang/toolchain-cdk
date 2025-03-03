local hmac_key = os.getenv("HMAC_KEY")
local user_id = ngx.var.arg_user_id:gsub("-", "_")
local token = ngx.var.arg_token

for i = 0, 1, 1
do
	local src = string.format("%s:%d", user_id, (ngx.time() / 10) + i)
	local digest = ngx.md5(ngx.hmac_sha1(hmac_key, src))
	-- ngx.say(user_id, ' ', token, ' ', digest, ' ', i)
	if digest == token then
		return
	end
end

ngx.exit(ngx.HTTP_UNAUTHORIZED)
