FROM node:24-alpine

WORKDIR /app

# Copy repository files
COPY . .

# Install dependencies
RUN npm install

# Build the API
RUN npm run api:build

# Expose port and start the API
EXPOSE 3000
CMD ["npm", "run", "api:start:prod"]
