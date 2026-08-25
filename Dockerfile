# =============================================================================
# GentlemanBird — Multi-Stage Docker Build
# =============================================================================
# Stage 1: Build Ladybird C++ engine + gentlemanbird-daemon
# Stage 2: Slim runtime with just binaries + Node.js daemon
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Builder
# ---------------------------------------------------------------------------
# Use the upstream Ladybird CI image — it has clang-21, cmake, vcpkg, rust,
# and every other build dep pre-installed.
FROM ghcr.io/ladybirdbrowser/ladybird-ci:latest AS builder

# Working directory for the source
WORKDIR /src

# Copy the entire source tree (filtered by .dockerignore)
COPY . .

# Bootstrap vcpkg (clones + builds vcpkg toolchain that cmake --preset expects)
ENV VCPKG_ROOT=/src/Build/vcpkg
RUN python3 Meta/ladybird.py vcpkg

# Build Ladybird in Release mode with Qt UI disabled (headless only).
# Limit parallel link jobs to avoid OOM on 16GB GitHub runners.
RUN cmake --preset Release \
      -DENABLE_GUI_TARGETS=OFF \
      -DLAGOM_LINK_POOL_SIZE=2 \
      -DCMAKE_C_COMPILER=clang \
      -DCMAKE_CXX_COMPILER=clang++ \
    && cmake --build Build/release --parallel $(nproc)

# Build the gentlemanbird-daemon (TypeScript → JavaScript)
WORKDIR /src/Utilities/gentlemanbird-daemon
RUN npm ci --ignore-scripts && npx tsc

# Prune dev dependencies — runtime only needs 'ws'
RUN npm prune --production

# ---------------------------------------------------------------------------
# Stage 2: Runtime
# ---------------------------------------------------------------------------
FROM ubuntu:26.04 AS runtime

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production

# Install only runtime dependencies
RUN apt-get update -o APT::Update::Error-Mode=any \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        fonts-liberation2 \
        libdrm2 \
        libegl1 \
        libgl1 \
        libpulse0 \
        libssl3t64 \
        nodejs \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user for running the daemon
RUN useradd --create-home --shell /bin/bash gentlemanbird

# Copy Ladybird binaries and resource files from builder
COPY --from=builder /src/Build/release/bin/ /opt/gentlemanbird/bin/
COPY --from=builder /src/Build/release/share/ /opt/gentlemanbird/share/

# Copy gentlemanbird-daemon
COPY --from=builder /src/Utilities/gentlemanbird-daemon/dist/ /opt/gentlemanbird/daemon/dist/
COPY --from=builder /src/Utilities/gentlemanbird-daemon/node_modules/ /opt/gentlemanbird/daemon/node_modules/
COPY --from=builder /src/Utilities/gentlemanbird-daemon/package.json /opt/gentlemanbird/daemon/

# Set ownership
RUN chown -R gentlemanbird:gentlemanbird /opt/gentlemanbird

# Switch to non-root user
USER gentlemanbird
WORKDIR /opt/gentlemanbird/daemon

# Environment defaults
ENV GB_PORT=9333
ENV GB_HOST=0.0.0.0
ENV GB_MAX_SESSIONS=5
ENV GB_WEBDRIVER_BASE_PORT=8100
ENV LADYBIRD_WEBDRIVER_PATH=/opt/gentlemanbird/bin/WebDriver
ENV XDG_DATA_DIRS=/opt/gentlemanbird/share

# Expose the daemon port
EXPOSE 9333

# Health check — the daemon exposes GET /health
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:9333/health || exit 1

# Start the daemon (which manages Ladybird WebDriver processes internally)
CMD ["node", "dist/server.js"]
