FROM node:22-alpine
WORKDIR /app
COPY package.json yarn.lock ./
COPY packages/backend/package.json packages/backend/
RUN yarn install --frozen-lockfile --ignore-scripts && yarn cache clean
COPY packages/backend packages/backend
WORKDIR /app/packages/backend
RUN yarn build
EXPOSE 8000
CMD ["sh", "-c", "yarn migrate && node dist/index.js"]
