# syntax=docker/dockerfile:1
# The same runtime dependency locks as the desktop bundle; no user configuration.
FROM node:22.20.0-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY docker/memory-manifest.mjs /tmp/memory-manifest.mjs

FROM deps AS core-deps
WORKDIR /app/core
COPY tencentdb-agent-memory/MemoryCore/package.json ./
COPY aionui/scripts/memory/locks/MemoryCore.json ./package-lock.json
RUN node /tmp/memory-manifest.mjs package.json \
    && npm ci --omit=dev --legacy-peer-deps --no-audit --no-fund

FROM deps AS knowledge-deps
WORKDIR /app/knowledge
COPY tencentdb-agent-memory/MemoryKnowledge/package.json ./
COPY aionui/scripts/memory/locks/MemoryKnowledge.json ./package-lock.json
RUN node /tmp/memory-manifest.mjs package.json \
    && npm ci --omit=dev --legacy-peer-deps --no-audit --no-fund

FROM deps AS panel-deps
WORKDIR /app/panel
COPY tencentdb-agent-memory/MemoryPanel/package.json ./
COPY aionui/scripts/memory/locks/MemoryPanel.json ./package-lock.json
RUN node /tmp/memory-manifest.mjs package.json \
    && npm ci --omit=dev --legacy-peer-deps --no-audit --no-fund

FROM deps AS panel-web
WORKDIR /build
COPY tencentdb-agent-memory/MemoryPanel/web/package.json ./
COPY aionui/scripts/memory/locks/web.json ./package-lock.json
RUN npm ci --no-audit --no-fund
COPY tencentdb-agent-memory/MemoryPanel/web/ ./
RUN npm run build

FROM deps AS proxy-deps
WORKDIR /app/proxy
COPY tencentdb-agent-memory/MemoryProxy/package.json tencentdb-agent-memory/MemoryProxy/package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22.20.0-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends curl tini ca-certificates git \
    && rm -rf /var/lib/apt/lists/*
COPY LICENSE /usr/share/licenses/ellmsha/LICENSE
COPY tencentdb-agent-memory/LICENSE /usr/share/licenses/tencentdb-agent-memory/LICENSE
ENV NODE_ENV=production NODE_OPTIONS=--max-old-space-size=1536
ENTRYPOINT ["/usr/bin/tini", "--"]

FROM runtime AS memory-core
WORKDIR /app/core
COPY --from=core-deps /app/core ./
COPY tencentdb-agent-memory/MemoryCore/src/ ./src/
ENV TDAI_GATEWAY_CONFIG=/data/config/tdai-gateway.yaml TDAI_GATEWAY_HOST=0.0.0.0 TDAI_DATA_DIR=/data/tdai-memory
RUN mkdir -p /data/tdai-memory /data/config
EXPOSE 8420
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD curl -fsS http://127.0.0.1:${TDAI_GATEWAY_PORT:-8420}/health || exit 1
CMD ["node", "--import", "tsx", "src/gateway/server.ts"]

FROM runtime AS memory-hub
WORKDIR /app
COPY --from=knowledge-deps /app/knowledge ./knowledge/
COPY --from=panel-deps /app/panel ./panel/
COPY --from=panel-web /build/dist ./panel/web/dist/
COPY tencentdb-agent-memory/MemoryKnowledge/src/ ./knowledge/src/
COPY tencentdb-agent-memory/MemoryKnowledge/openapi.yaml ./knowledge/openapi.yaml
COPY tencentdb-agent-memory/MemoryPanel/src/ ./panel/src/
COPY docker/start-memory-hub.sh /usr/local/bin/start-memory-hub
ENV PANEL_PORT=8125 KNOWLEDGE_PORT=8424 KNOWLEDGE_DATA_DIR=/data/knowledge KNOWLEDGE_DB_PATH=/data/knowledge/knowledge.db \
    TDAI_AGENT_TEMPLATE_DIR=/data/knowledge/agent-templates KNOWLEDGE_LLM_BINDING_SYNC=0 LLM_MODE=custom LOG_LEVEL=info LOG_FORMAT=json
RUN mkdir -p /app/panel/config /data/knowledge
EXPOSE 8125 8424
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD curl -fsS http://127.0.0.1:${PANEL_PORT:-8125}/health && curl -fsS http://127.0.0.1:${KNOWLEDGE_PORT:-8424}/health || exit 1
CMD ["bash", "/usr/local/bin/start-memory-hub"]

FROM runtime AS memory-proxy
WORKDIR /app/proxy
COPY --from=proxy-deps /app/proxy ./
COPY tencentdb-agent-memory/MemoryProxy/src/ ./src/
ENV PROXY_DB_PATH=/data/tdai-memory-proxy/proxy.db
RUN groupadd -r app && useradd -r -g app -u 10001 -m app \
    && mkdir -p /data/tdai-memory-proxy /app/proxy/logs && chown -R app:app /data /app/proxy
USER app
EXPOSE 8096
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD curl -fsS http://127.0.0.1:8096/health || exit 1
CMD ["node", "--import", "tsx/esm", "src/index.ts", "--config", "/data/config.yaml"]
