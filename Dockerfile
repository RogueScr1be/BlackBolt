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

# Expose port and start the API
EXPOSE 3000
CMD ["npm", "run", "api:start:prod"]
