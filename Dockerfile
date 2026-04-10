FROM node:24-alpine

RUN apk add --no-cache bash

WORKDIR /app

COPY . .

RUN npm ci
RUN npm run api:build

EXPOSE 3000
RUN chmod +x scripts/start-api-with-migrations.sh
CMD ["bash", "scripts/start-api-with-migrations.sh"]
