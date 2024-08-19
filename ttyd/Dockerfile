FROM tsl0922/ttyd:alpine AS ttyd

FROM nginx:alpine

COPY --from=ttyd /usr/bin/ttyd /usr/bin/ttyd

RUN apk add --no-cache \
	py3-pip py3-psutil \
	aws-cli \
	fish

RUN pip install --user --break-system-packages --no-cache-dir --no-deps python-pm \
	&& pip install --user --break-system-packages --no-cache-dir termtables>=0.2.2 colorama>=0.4.3

COPY entrypoint/* /docker-entrypoint.d/

# @TODO
# https://fishshell.com/docs/current/cmds/fish_greeting.html
