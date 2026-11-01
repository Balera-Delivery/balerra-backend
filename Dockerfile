# Multi-Stage Production Dockerfile for Balera Backend
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

# Copy source code and build
COPY . .
RUN npx prisma generate
RUN npm run build

# Production Runtime Stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Install PM2 globally for clustering
RUN npm install -g pm2

# Copy production artifacts
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY ecosystem.config.js ./

EXPOSE 5000

CMD ["pm2-runtime", "start", "ecosystem.config.js", "--env", "production"]
