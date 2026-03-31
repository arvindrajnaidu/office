FROM node:22-alpine

LABEL org.opencontainers.image.title="Buzzie AI — All Channels" \
  org.opencontainers.image.description="Unified container running WhatsApp, Telegram, Email, and Voice channels"

WORKDIR /app

# Copy workspace root + core (shared dependency)
COPY package.json ./
COPY core/package.json ./core/package.json
COPY core/src/ ./core/src/

# Copy each channel's package manifest
COPY whatsapp/package.json whatsapp/package-lock.json ./whatsapp/
COPY telegram/package.json telegram/package-lock.json* ./telegram/
COPY email/package.json email/package-lock.json* ./email/
COPY voice/package.json voice/package-lock.json* ./voice/

# Install dependencies for each channel
RUN cd whatsapp && npm install --omit=dev && \
    cd ../telegram && npm install --omit=dev && \
    cd ../email && npm install --omit=dev && \
    cd ../voice && npm install --omit=dev

# Copy channel source code
COPY whatsapp/ ./whatsapp/
COPY telegram/ ./telegram/
COPY email/ ./email/
COPY voice/ ./voice/

# Copy entrypoint
COPY all-channels/ ./all-channels/

ENV NODE_ENV=production
ENV WHATSAPP_CLI_HOME=/data/whatsapp
ENV TELEGRAM_CLI_HOME=/data/telegram
ENV EMAIL_CLI_HOME=/data/email
ENV VOICE_CLI_HOME=/data/voice

EXPOSE 3100 3101 3102 3103

HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "process.exit(0)"

CMD ["node", "all-channels/start.js"]
