# Build the checked-out forks so Docker and desktop contain the same changes.
FROM rust:1.95.0-bookworm AS backend
RUN apt-get update && apt-get install -y --no-install-recommends cmake pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src/aioncore
COPY aioncore/ ./
COPY aionrs/ /src/aionrs/
RUN cargo build --locked --release -p aionui-app --bin aioncore

FROM node:22-bookworm-slim AS frontend
RUN npm install -g bun@1.3.9
WORKDIR /src/aionui
COPY aionui/ ./
RUN bun install --frozen-lockfile --ignore-scripts
ARG TDAI_PANEL_URL=http://127.0.0.1:8125/
ENV VITE_TDAI_PANEL_URL=$TDAI_PANEL_URL
RUN bun run package \
    && bun build --compile --outfile=/src/aionui-web packages/web-cli/src/index.ts

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl git libicu-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/ellmsha
COPY --from=backend /src/aioncore/target/release/aioncore ./aioncore
COPY --from=frontend /src/aionui-web ./aionui-web
COPY --from=frontend /src/aionui/out/renderer ./static
COPY --from=frontend /src/aionui/out/main/builtin-mcp-tencent-memory.js ./mcp/builtin-mcp-tencent-memory.js
COPY --from=frontend /src/aionui/package.json ./package.json
COPY bmad-method/ellmsha-skills/ ./global-skills/bmad/
COPY ponytail/skills/ ./global-skills/ponytail/
COPY aionui/resources/ellmsha-skills/ ./global-skills/ellmsha/
ENV AIONUI_BACKEND_BIN=/opt/ellmsha/aioncore \
    AIONUI_DATA_DIR=/data AIONUI_PORT=3000 AIONUI_ALLOW_REMOTE=true AIONUI_OPEN_BROWSER=0
VOLUME ["/data"]
EXPOSE 3000
CMD ["./aionui-web", "start", "--remote", "--port", "3000", "--data-dir", "/data", "--no-open"]
