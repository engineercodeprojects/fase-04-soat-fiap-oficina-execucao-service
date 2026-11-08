# ─── Stage 1: builder ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ─── Stage 2: runtime ────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app
# npm 11 traz tar >= 7.5.19 (CVE-2026-59873 no tar 6 do npm 10) — scan do Trivy no CD.
RUN npm install -g npm@11 && npm cache clean --force
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node --from=builder /app/dist ./dist
USER node
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD wget -qO- http://localhost:3002/health || exit 1
# Tabelas DynamoDB sao provisionadas pelo Terraform (infra-db): sem migracao no boot.
CMD ["node", "dist/main.js"]
