FROM node:24-alpine

RUN apk add --no-cache git curl

WORKDIR /app

# Clone the repository directly from GitHub
RUN git clone https://github.com/RogueScr1be/BlackBolt.git . && \
    git checkout main

# Install dependencies
RUN npm install

# Build the API
RUN npm run api:build

# Expose port and start the API with migrations
EXPOSE 3000
RUN chmod +x scripts/start-api-with-migrations.sh
CMD ["bash", "scripts/start-api-with-migrations.sh"]
