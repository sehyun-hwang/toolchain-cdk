FROM node:18-alpine as ttyd-frontend

WORKDIR /mnt
COPY --from=ttyd-git html/package.json html/yarn.lock html/.yarnrc.yml ./
COPY --from=ttyd-git html/.yarn .yarn

RUN corepack enable \
	&& corepack prepare yarn@stable --activate \
	&& yarn add serve \
	&& yarn cache clean

COPY --from=ttyd-git html ./

RUN sed -i \
	-e "s=entry: {=entry: {terminal:'./components/terminal/index.tsx',=" \
	-e "s=output: {=output: {library:{name:'ttyd_[name]',type:'window'},=" \
	webpack.config.js

RUN NODE_ENV=production yarn webpack

CMD ["node_modules/.bin/serve", "-Cp", "9000", "dist"]

FROM node:lts-alpine

WORKDIR /mnt
COPY package.json pnpm-lock.yaml ./
COPY patches patches

RUN corepack enable pnpm \
	&& pnpm i --force --frozen-lockfile \
	&& pnpm store prune

COPY --from=ttyd-frontend /mnt/dist/*.js ttyd/
COPY . ./

RUN pnpm build

CMD ["pnpm", "preview"]
