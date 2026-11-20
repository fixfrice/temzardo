FROM node:22-alpine AS build
WORKDIR /app
COPY package.json yarn.lock ./
COPY packages/frontend/package.json packages/frontend/
RUN yarn install --frozen-lockfile --ignore-scripts
COPY packages/frontend packages/frontend
RUN yarn workspace @trainiq/frontend build

FROM nginx:1.27-alpine
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/frontend/dist /usr/share/nginx/html
