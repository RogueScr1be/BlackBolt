FROM node:24-alpine

WORKDIR /app

# Copy package files (needed for dependency installation)
COPY package.json package-lock.json ./

# Copy source code and schema (needed for build)
COPY apps/ ./apps/
COPY prisma/ ./prisma/

# Install dependencies
RUN npm ci

# Build
RUN npm run api:build

# Start
EXPOSE 3000
CMD ["npm", "run", "api:start:prod"]
