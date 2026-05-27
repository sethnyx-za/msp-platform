FROM alpine:3.19

# Install dependencies: postgresql-client for pg_dump, rclone for remote sync, supercronic for cron
RUN apk add --no-cache \
    postgresql16-client \
    curl \
    bash \
    tzdata

# Install rclone
RUN curl -fsSL https://rclone.org/install.sh | bash

# Install supercronic (cron for containers — no cron daemon needed)
ENV SUPERCRONIC_URL=https://github.com/aptible/supercronic/releases/download/v0.2.29/supercronic-linux-amd64 \
    SUPERCRONIC_SHA1SUM=cd48d45c4b10f3f0bfdd3a57d054cd05ac96812b \
    SUPERCRONIC=/usr/local/bin/supercronic

RUN curl -fsSL "$SUPERCRONIC_URL" -o "$SUPERCRONIC" \
    && echo "${SUPERCRONIC_SHA1SUM}  ${SUPERCRONIC}" | sha1sum -c - \
    && chmod +x "$SUPERCRONIC"

WORKDIR /app

COPY backup.sh /app/backup.sh
RUN chmod +x /app/backup.sh

# Write crontab dynamically from env at startup
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
