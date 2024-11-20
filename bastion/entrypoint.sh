#!/bin/sh

set -eux

chown nginx /run/ttyd

echo "proxy_pass ${API_GATEWAY_AUTH_URL};" > /usr/local/openresty/nginx/conf/auth-proxy-pass.conf

if [ -z "$ALLOWED_ORIGIN-" ]; then
    touch /usr/local/openresty/nginx/conf/allowed_origin.conf
else
    echo "$ALLOWED_ORIGIN \$http_origin;" > /usr/local/openresty/nginx/conf/allowed-origin.conf
fi

cat /etc/nginx/conf.d/*.conf

HMAC_KEY=$(xxd -pl 16 /dev/urandom) exec "$@"
