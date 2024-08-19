FROM node:18-alpine

WORKDIR /mnt
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn .yarn

RUN corepack enable \
	&& corepack prepare yarn@stable --activate \
	&& yarn add serve \
	&& yarn cache clean

COPY . ./

RUN sed -i \
	-e "s=entry: {=entry: {terminal:'./components/terminal/index.tsx',=" \
	-e "s=output: {=output: {library:{name:'ttyd_[name]',type:'var'},=" \
	webpack.config.js

RUN NODE_ENV=production yarn webpack

CMD ["node_modules/.bin/serve", "-Cp", "9000", "dist"]
