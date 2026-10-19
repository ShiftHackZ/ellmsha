# Build the checked-out forks so Docker and desktop contain the same changes.
FROM node:22.20.0-bookworm-slim AS node-base

FROM node-base AS chrome-devtools-mcp
WORKDIR /src/chrome-devtools-mcp
COPY scripts/prepare-chrome-devtools-mcp.js /tmp/prepare-chrome-devtools-mcp.js
COPY scripts/run-build-command.js /tmp/run-build-command.js
COPY chrome-devtools-mcp/ ./
ENV PUPPETEER_SKIP_DOWNLOAD=true NPM_CONFIG_CACHE=/tmp/npm-cache NODE_OPTIONS=--max-old-space-size=4096
RUN node -e "const p=require('./package.json');const l=require('./package-lock.json');if(p.version!=='0.16.0'||l.packages[''].version!=='0.16.0')process.exit(1)" \
    && node -e "const {hashBuildInputs}=require('/tmp/prepare-chrome-devtools-mcp.js');if(hashBuildInputs(process.cwd())!=='30d8670bf6c0120b677d9687e92decc507df60cc19c95ebe4d6623ad4786facb')process.exit(1)" \
    && npm ci
RUN npm run bundle \
    && mkdir -p /src/chrome-devtools-mcp-runtime \
    && cp -R build package.json package-lock.json LICENSE /src/chrome-devtools-mcp-runtime/ \
    && printf '%s\n' '{"sourceDigest":"30d8670bf6c0120b677d9687e92decc507df60cc19c95ebe4d6623ad4786facb","tag":"chrome-devtools-mcp-v0.16.0","upstreamCommit":"4f7b06898327ab5be42c85bd98bd176f33d55d89","version":"0.16.0"}' > /src/chrome-devtools-mcp-runtime/.ellmsha-chrome-devtools-mcp-pin.json

FROM rust:1.95.0-bookworm AS backend
RUN apt-get update && apt-get install -y --no-install-recommends cmake pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src/aioncore
COPY aioncore/ ./
COPY aionrs/ /src/aionrs/
ENV CARGO_BUILD_JOBS=2
RUN cargo build --locked --release -p aionui-app --bin aioncore

FROM node:22.20.0-bookworm-slim AS frontend
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npm install -g bun@1.3.9
WORKDIR /src/aionui
COPY aionui/ ./
COPY scripts/prepare-chrome-devtools-mcp.js /src/scripts/prepare-chrome-devtools-mcp.js
COPY scripts/run-build-command.js /src/scripts/run-build-command.js
COPY --from=chrome-devtools-mcp /src/chrome-devtools-mcp-runtime /src/.data/chrome-devtools-mcp-runtime
ENV ELLM_SHA_CHROME_DEVTOOLS_MCP_RUNTIME=/src/.data/chrome-devtools-mcp-runtime
RUN bun install --frozen-lockfile --ignore-scripts
ARG TDAI_PANEL_URL=http://127.0.0.1:8125/
ENV VITE_TDAI_PANEL_URL=$TDAI_PANEL_URL
RUN bun run package \
    && node scripts/build-mcp-servers.js \
    && bun build --compile --outfile=/src/aionui-web packages/web-cli/src/index.ts

FROM node:22.20.0-bookworm-slim AS mobile-mcp
WORKDIR /src/mobile-mcp
COPY scripts/prepare-mobile-mcp.js /tmp/prepare-mobile-mcp.js
COPY scripts/run-build-command.js /tmp/run-build-command.js
COPY mobile-mcp/ ./
RUN node -e "const {hashBuildInputs}=require('/tmp/prepare-mobile-mcp.js');if(hashBuildInputs(process.cwd())!=='2bf52e186569971f18fe78319ce14427ae3299ce059fbf5716f39d9f1c2666ad')process.exit(1)" \
    && npm ci \
    && npm run build \
    && npm prune --omit=dev

FROM golang:1.22.12-bookworm AS open-computer-use
ARG TARGETARCH
COPY --from=node-base /usr/local/bin/node /usr/local/bin/node
WORKDIR /src/open-computer-use
COPY scripts/prepare-open-computer-use.js /tmp/prepare-open-computer-use.js
COPY scripts/run-build-command.js /tmp/run-build-command.js
COPY open-codex-computer-use/ ./
RUN node -e "const p=require('/tmp/prepare-open-computer-use.js');if(p.hashBuildInputs(process.cwd())!==p.OPEN_COMPUTER_USE_SOURCE_DIGEST)throw Error('OCU source pin mismatch')"
WORKDIR /src/open-computer-use/apps/OpenComputerUseLinux
RUN case "$TARGETARCH" in amd64|arm64) ;; *) echo "Unsupported Open Computer Use architecture: $TARGETARCH" >&2; exit 1 ;; esac \
    && mkdir -p /runtime \
    && CGO_ENABLED=0 GOOS=linux GOARCH="$TARGETARCH" go build -mod=readonly -trimpath -ldflags '-s -w -X main.version=0.3.6' -o /runtime/open-computer-use . \
    && cp ../../LICENSE /runtime/LICENSE \
    && TARGETARCH="$TARGETARCH" node -e "const fs=require('fs'),p=require('/tmp/prepare-open-computer-use.js');fs.writeFileSync('/runtime/'+p.OPEN_COMPUTER_USE_MARKER,JSON.stringify({commit:p.OPEN_COMPUTER_USE_COMMIT,upstreamCommit:p.OPEN_COMPUTER_USE_UPSTREAM_COMMIT,sourceDigest:p.OPEN_COMPUTER_USE_SOURCE_DIGEST,version:p.OPEN_COMPUTER_USE_VERSION,platform:'linux',arch:process.env.TARGETARCH==='amd64'?'x64':'arm64'}))" \
    && /runtime/open-computer-use --version | grep -Fx '0.3.6'

FROM node:22.20.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl git libicu-dev python3 python3-gi gir1.2-atspi-2.0 gir1.2-gtk-3.0 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/ellmsha
COPY LICENSE /usr/share/licenses/ellmsha/LICENSE
COPY --from=backend /src/aioncore/target/release/aioncore ./aioncore
COPY --from=frontend /src/aionui-web ./aionui-web
COPY --from=frontend /src/aionui/out/renderer ./static
COPY --from=frontend /src/aionui/out/main/builtin-mcp-tencent-memory.js ./mcp/builtin-mcp-tencent-memory.js
COPY --from=frontend /src/aionui/out/main/builtin-mcp-chat-history.js ./mcp/builtin-mcp-chat-history.js
COPY --from=frontend /src/aionui/out/main/builtin-mcp-browser.js ./mcp/builtin-mcp-browser.js
COPY --from=frontend /src/aionui/out/main/builtin-mcp-chrome-devtools.js ./mcp/builtin-mcp-chrome-devtools.js
COPY --from=frontend /src/aionui/out/main/chrome-devtools-mcp ./mcp/chrome-devtools-mcp
COPY --from=frontend /src/aionui/package.json ./package.json
COPY --from=mobile-mcp /src/mobile-mcp/lib ./mobile-mcp/lib
COPY --from=mobile-mcp /src/mobile-mcp/node_modules ./mobile-mcp/node_modules
COPY --from=mobile-mcp /src/mobile-mcp/package.json ./mobile-mcp/package.json
COPY --from=mobile-mcp /src/mobile-mcp/package-lock.json ./mobile-mcp/package-lock.json
COPY --from=mobile-mcp /src/mobile-mcp/LICENSE ./mobile-mcp/LICENSE
COPY --from=open-computer-use /runtime ./open-computer-use
COPY plugins/ ./plugins/
COPY bmad-method/ellmsha-skills/ ./global-skills/bmad/
COPY ponytail/skills/ ./global-skills/ponytail/
COPY aionui/resources/ellmsha-skills/ ./global-skills/ellmsha/
ENV AIONUI_BACKEND_BIN=/opt/ellmsha/aioncore \
    ELLM_SHA_BUILTIN_PLUGINS_PATH=/opt/ellmsha/plugins \
    ELLM_SHA_MOBILE_MCP_ENTRY=/opt/ellmsha/mobile-mcp/lib/index.js \
    ELLM_SHA_OPEN_COMPUTER_USE_ENTRY=/opt/ellmsha/open-computer-use/open-computer-use \
    AIONUI_DATA_DIR=/data AIONUI_PORT=3000 AIONUI_ALLOW_REMOTE=true AIONUI_OPEN_BROWSER=0
VOLUME ["/data"]
EXPOSE 3000
CMD ["./aionui-web", "start", "--remote", "--port", "3000", "--data-dir", "/data", "--no-open"]
