FROM node:24-alpine

RUN apk add --no-cache git bash

WORKDIR /app

ARG BLACKBOLT_REF
RUN : "${BLACKBOLT_REF:?BLACKBOLT_REF is required}" && \
    git clone https://github.com/RogueScr1be/BlackBolt.git . && \
    chmod +x scripts/verify-release-source.sh && \
    ./scripts/verify-release-source.sh

RUN npm ci
RUN npm run api:build

CMD ["npm", "run", "worker:start:prod"]
