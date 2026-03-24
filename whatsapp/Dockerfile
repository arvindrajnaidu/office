FROM mcr.microsoft.com/playwright:v1.58.2-noble

LABEL org.opencontainers.image.title="WhatsApp CLI Bot" \
  org.opencontainers.image.description="WhatsApp CLI bot runtime container"

# Install ffmpeg and yt-dlp
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ffmpeg && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN chown pwuser:pwuser /app

# Copy workspace root + core package (dependency)
COPY --chown=pwuser:pwuser package.json ./
COPY --chown=pwuser:pwuser core/package.json ./core/package.json
COPY --chown=pwuser:pwuser core/src/ ./core/src/
COPY --chown=pwuser:pwuser whatsapp/package.json whatsapp/package-lock.json ./whatsapp/

USER pwuser
RUN cd whatsapp && npm install --omit=dev

COPY --chown=pwuser:pwuser whatsapp/ ./whatsapp/

ENV NODE_ENV=production
ENV WHATSAPP_CLI_HOME=/data

HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "process.exit(0)"

CMD ["node", "whatsapp/bin/whatsapp.mjs"]
