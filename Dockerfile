FROM node:24-alpine

WORKDIR /app

# Copy everything from the repository
COPY . .

# Install dependencies
RUN npm ci

# Build
RUN npm run api:build

# Start
EXPOSE 3000
CMD ["npm", "run", "api:start:prod"]
