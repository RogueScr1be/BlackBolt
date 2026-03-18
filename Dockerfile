FROM node:24.13.1-alpine

RUN apk add --no-cache git bash

WORKDIR /app

ARG BLACKBOLT_REF=codex/backend-align-prod
RUN git clone https://github.com/RogueScr1be/BlackBolt.git . && \
    git checkout "${BLACKBOLT_REF}"

RUN npm ci
RUN npm run api:build

CMD ["npm", "run", "api:start:prod"]
