FROM node:24.13.1-alpine

RUN apk add --no-cache git bash

WORKDIR /app

ARG BLACKBOLT_REF=codex/backend-align-prod
ARG BLACKBOLT_SHA=269bb33cd13d97702ffe4ae0d795efa9022fd118
RUN git clone https://github.com/RogueScr1be/BlackBolt.git . && \
    git checkout "${BLACKBOLT_REF}" && \
    test "$(git rev-parse HEAD)" = "${BLACKBOLT_SHA}"

RUN npm ci
RUN npm run api:build

CMD ["npm", "run", "api:start:prod"]
