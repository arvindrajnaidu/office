FROM node:22-alpine

LABEL org.opencontainers.image.title="WhatsApp CLI Channel" \
  org.opencontainers.image.description="WhatsApp channel runtime container"

WORKDIR /app

# Copy workspace root + core package (dependency)
COPY package.json ./
COPY core/package.json ./core/package.json
COPY core/src/ ./core/src/
COPY whatsapp/package.json whatsapp/package-lock.json ./whatsapp/

RUN cd whatsapp && npm install --omit=dev

COPY whatsapp/ ./whatsapp/

ENV NODE_ENV=production
ENV WHATSAPP_CLI_HOME=/data

HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "process.exit(0)"

CMD ["node", "whatsapp/bin/whatsapp.mjs"]
