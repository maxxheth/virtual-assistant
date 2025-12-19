# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production
WORKDIR /app

# Copy built files and dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
RUN npm ci --only=production

# Create non-root user for security
RUN addgroup -g 1001 -S mcp && \
	adduser -S mcp -u 1001

# Switch to non-root user
USER mcp

# Environment variable for vault path
ENV VAULT_PATH=/vault

# The MCP server uses stdio, so we need to run it directly
ENTRYPOINT ["node", "dist/index.js"]
