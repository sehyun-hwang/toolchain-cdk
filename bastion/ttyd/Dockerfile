FROM tsl0922/ttyd:alpine AS ttyd

FROM alpine

COPY --from=ttyd /usr/bin/ttyd /usr/bin/ttyd

RUN apk add --no-cache \
	# pypm 
	py3-pip py3-psutil \
	# terminal
	tmux fish \
	# user-land
	openssh-client git aws-cli

RUN pip install --user --break-system-packages --no-cache-dir --no-deps python-pm \
	&& pip install --user --break-system-packages --no-cache-dir termtables>=0.2.2 colorama>=0.4.3

RUN sed -i 's/if len(name) > 16:/if False:/' /root/.local/lib/python3.12/site-packages/pypm/manager.py \
	&& addgroup -g 101 -S nginx \
	&& adduser -S -D -H -u 101 -h /var/cache/nginx -s /sbin/nologin -G nginx -g nginx nginx

# @TODO
# https://fishshell.com/docs/current/cmds/fish_greeting.html
ENV PYPMDEBUG=True
CMD ["python", "-m", "pypm", "init"]
