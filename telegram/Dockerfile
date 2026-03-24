FROM node:22-alpine

LABEL org.opencontainers.image.title="Telegram Bot Channel" \
  org.opencontainers.image.description="Telegram bot channel runtime container"

WORKDIR /app

# Copy workspace root + core package (dependency)
COPY package.json ./
COPY core/package.json ./core/package.json
COPY core/src/ ./core/src/
COPY telegram/package.json telegram/package-lock.json ./telegram/

RUN cd telegram && npm install --omit=dev

COPY telegram/ ./telegram/

ENV NODE_ENV=production
ENV TELEGRAM_CLI_HOME=/data

HEALTHCHECK --interval=60s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "process.exit(0)"

CMD ["node", "telegram/bin/telegram.mjs"]
