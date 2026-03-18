FROM node:24.13.1-alpine

RUN apk add --no-cache git bash

WORKDIR /app

ARG BLACKBOLT_REF=5efafd68ef13fd1932961901884c18f3ab8da8fb
RUN git clone https://github.com/RogueScr1be/BlackBolt.git . && \
    git checkout "${BLACKBOLT_REF}"

RUN npm ci
RUN npm run api:build

CMD ["npm", "run", "api:start:prod"]
