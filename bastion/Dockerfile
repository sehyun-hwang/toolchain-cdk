FROM openresty/openresty:alpine

RUN addgroup -g 101 -S nginx \
    && adduser -S -D -H -u 101 -h /var/cache/nginx -s /sbin/nologin -G nginx -g nginx nginx

COPY entrypoint.sh /bin/
COPY conf /etc/nginx/conf.d
COPY lua /etc/nginx/lua

ENTRYPOINT ["/bin/entrypoint.sh"]
CMD ["/usr/local/openresty/bin/openresty", "-g", "user nginx; daemon off;"]
