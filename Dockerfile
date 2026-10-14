FROM cgr.dev/chainguard/node:22-dev AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY server/package.json server/package-lock.json ./server/
RUN npm ci --omit=dev --prefix server
COPY server ./server
COPY app ./app
COPY web ./web
COPY public ./public
COPY next.config.js ./next.config.js
RUN DATABASE_URL="mysql://build:build@localhost:3306/looptalk" npm run prisma:generate --prefix server
RUN npm run build
USER root
RUN mkdir -p /data/uploads && chown -R 65532:65532 /data

FROM cgr.dev/chainguard/node:22 AS runtime
ENV PORT=3000 \
    UPLOAD_DIR=/data/uploads
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY server ./server
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder --chown=65532:65532 /data /data
EXPOSE 3000
VOLUME ["/data/uploads"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3000/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["server/scripts/start.js"]
