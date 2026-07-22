# =============================================================================
# Dockerfile for Enterprise Diagnosis Agent - Production
# =============================================================================

FROM node:20-bookworm-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Enable corepack for pnpm
RUN corepack enable && pnpm add -g pnpm

# Create non-root user
RUN groupadd -g 1000 nodejs && \
    useradd -r -u 1000 -g nodejs -d /app -s /sbin/nologin -c "Node.js runtime user" nodejs

# Copy package files
COPY --chown=nodejs:nodejs package.json pnpm-lock.yaml ./

# Install dependencies with frozen lockfile
RUN pnpm install --frozen-lockfile --prod=false

# Copy source code
COPY --chown=nodejs:nodejs . .

# Build
ENV NODE_ENV=production
RUN pnpm build

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Handle SIGTERM gracefully
CMD ["pnpm", "start"]
