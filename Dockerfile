FROM node:24.13.1-alpine

RUN apk add --no-cache bash

WORKDIR /app

COPY . .

RUN npm ci
RUN npm run api:build

CMD ["npm", "run", "api:start:prod"]
