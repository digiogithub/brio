# syntax=docker/dockerfile:1.4

####################################################################################################
## Build Stage — Install dependencies and build frontend

FROM oven/bun:latest AS builder
WORKDIR /brio

# Copy package files for dependency installation
COPY package.json bun.lock* bunfig.toml ./
COPY brio/package.json ./brio/
COPY api/package.json ./api/
COPY app/package.json ./app/
COPY docs/package.json ./docs/
COPY packages/composables/package.json ./packages/composables/
COPY packages/constants/package.json ./packages/constants/
COPY packages/create-brio-extension/package.json ./packages/create-brio-extension/
COPY packages/exceptions/package.json ./packages/exceptions/
COPY packages/extensions-sdk/package.json ./packages/extensions-sdk/
COPY packages/schema/package.json ./packages/schema/
COPY packages/specs/package.json ./packages/specs/
COPY packages/storage/package.json ./packages/storage/
COPY packages/storage-driver-azure/package.json ./packages/storage-driver-azure/
COPY packages/storage-driver-cloudinary/package.json ./packages/storage-driver-cloudinary/
COPY packages/storage-driver-gcs/package.json ./packages/storage-driver-gcs/
COPY packages/storage-driver-local/package.json ./packages/storage-driver-local/
COPY packages/storage-driver-s3/package.json ./packages/storage-driver-s3/
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/types/package.json ./packages/types/
COPY packages/update-check/package.json ./packages/update-check/
COPY packages/utils/package.json ./packages/utils/
COPY tests/blackbox/package.json ./tests/blackbox/

# Install all dependencies
ARG BUN_INSTALL_FLAGS=""
RUN bun install ${BUN_INSTALL_FLAGS}

# Copy source code
COPY . .

# Build specs package first (generates OpenAPI spec)
RUN bun run --filter @brio/specs build

# Build the frontend app (Vite build)
# No TypeScript compilation needed — Bun runs TS natively for server code,
# but Vue-based admin extensions still need precompiled browser artifacts.
RUN bun run --filter @brio/app build
RUN bun run ext:build

# Create required directories
RUN mkdir -p database extensions uploads

####################################################################################################
## Production Image

FROM oven/bun:latest AS runtime

# Use non-root user for security
USER bun
WORKDIR /brio

EXPOSE 8055

ENV \
	DB_CLIENT="sqlite3" \
	DB_FILENAME="/brio/database/database.sqlite" \
	EXTENSIONS_PATH="/brio/extensions" \
	STORAGE_LOCAL_ROOT="/brio/uploads" \
	NODE_ENV="production"

# Copy built application
COPY --from=builder --chown=bun:bun /brio .

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
	CMD bun -e "fetch('http://localhost:8055/server/ping').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["sh", "-c", "bun /brio/brio/cli.js bootstrap && bun /brio/brio/cli.js start"]
