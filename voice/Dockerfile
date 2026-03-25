FROM node:22-alpine

LABEL org.opencontainers.image.title="Voice Bot Channel" \
  org.opencontainers.image.description="Voice channel runtime container (Twilio + OpenAI)"

WORKDIR /app

COPY package.json ./
COPY core/package.json ./core/package.json
COPY core/src/ ./core/src/
COPY voice/package.json voice/package-lock.json ./voice/

RUN cd voice && npm install --omit=dev

COPY voice/ ./voice/

ENV NODE_ENV=production
ENV VOICE_CLI_HOME=/data

EXPOSE 3100

HEALTHCHECK --interval=60s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3100/health || exit 1

CMD ["node", "voice/bin/voice.mjs"]
