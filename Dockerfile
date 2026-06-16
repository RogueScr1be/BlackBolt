FROM node:24-alpine

RUN apk add --no-cache git bash

WORKDIR /app

ARG BLACKBOLT_REF=codex/objective-closure-0811722
RUN git clone https://github.com/RogueScr1be/BlackBolt.git . && \
    git checkout "${BLACKBOLT_REF}"

RUN npm ci
RUN npm run api:build

CMD ["npm", "run", "worker:start:prod"]
