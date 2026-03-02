FROM node:24-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
COPY apps/ ./apps/
COPY prisma/ ./prisma/
COPY scripts/ ./scripts/

# Install dependencies
RUN npm ci

# Build
RUN npm run api:build

# Start
EXPOSE 3000
CMD ["npm", "run", "api:start:prod"]
