FROM node:24.13.1-alpine

RUN apk add --no-cache git bash

WORKDIR /app

ARG BLACKBOLT_REF=codex/campaign-runs-align-prod
ARG BLACKBOLT_CACHE_BUSTER=20260320-v1-campaign-runs-align-prod-prisma
RUN git clone https://github.com/RogueScr1be/BlackBolt.git . && \
    git checkout "${BLACKBOLT_REF}" && \
    echo "${BLACKBOLT_CACHE_BUSTER}" >/dev/null

RUN npm ci
RUN npm run api:build

CMD ["npm", "run", "api:start:prod"]
