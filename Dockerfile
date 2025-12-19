# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Stage 2: Development
FROM node:20-alpine AS development
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Run in watch mode for development
CMD ["npm", "run", "dev"]

# Stage 3: Builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Stage 4: Production artifacts
FROM alpine:latest AS production
WORKDIR /app
# Copy only the built artifacts needed for the plugin
COPY --from=builder /app/main.js ./
COPY --from=builder /app/manifest.json ./
COPY --from=builder /app/styles.css ./
# This stage is primarily for extracting build artifacts
CMD ["echo", "Build complete. Copy main.js, manifest.json, and styles.css to your Obsidian plugins folder."]
