FROM node:22-alpine AS builder

WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build TypeScript to dist
RUN npm run build

# Production image
FROM node:22-alpine

WORKDIR /app

# Set node environment to production
ENV NODE_ENV=production

# Copy only the necessary files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./

# Install only production dependencies
RUN npm install --omit=dev

# Expose port (Fastify default is 3000)
EXPOSE 3000

# Start the application
CMD ["npm", "run", "start:prod"]
