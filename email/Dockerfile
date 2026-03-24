FROM node:22-alpine

LABEL org.opencontainers.image.title="Email Bot Channel" \
  org.opencontainers.image.description="Email bot channel runtime container (Resend)"

WORKDIR /app

COPY package.json ./
COPY core/package.json ./core/package.json
COPY core/src/ ./core/src/
COPY email/package.json email/package-lock.json ./email/

RUN cd email && npm install --omit=dev

COPY email/ ./email/

ENV NODE_ENV=production
ENV EMAIL_CLI_HOME=/data

HEALTHCHECK --interval=60s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "process.exit(0)"

CMD ["node", "email/bin/email.mjs"]
