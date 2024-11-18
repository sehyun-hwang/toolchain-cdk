#!/bin/sh

set -eux

chown 101 /run/ttyd
echo "proxy_pass ${API_GATEWAY_AUTH_URL};" > /usr/local/openresty/nginx/conf/auth-proxy-pass.conf
HMAC_KEY=$(xxd -pl 16 /dev/urandom) exec $@
