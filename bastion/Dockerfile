FROM openresty/openresty:alpine

RUN addgroup -g 101 -S nginx \
    && adduser -S -D -H -u 101 -h /var/cache/nginx -s /sbin/nologin -G nginx -g nginx nginx

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY /lua /lua

CMD ["/usr/local/openresty/bin/openresty", "-g", "user nginx; daemon off;"]
