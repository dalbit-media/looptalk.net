FROM cgr.dev/chainguard/node:22-dev AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY server/package.json server/package-lock.json ./server/
RUN npm ci --omit=dev --prefix server
COPY mobile/package.json mobile/package-lock.json ./mobile/
RUN npm ci --omit=dev --prefix mobile
COPY server ./server
COPY mobile ./mobile
COPY app ./app
COPY public ./public
COPY next.config.js ./next.config.js
RUN npm run export:web --prefix mobile
RUN DATABASE_URL="file:/tmp/looptalk-build.db" npm run prisma:generate --prefix server
RUN npm run build
USER root
RUN mkdir -p /data/uploads && chown -R 65532:65532 /data

FROM cgr.dev/chainguard/node:22 AS runtime
ENV PORT=3000 \
    UPLOAD_DIR=/data/uploads \
    DATABASE_URL=file:/data/looptalk.db
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY server ./server
COPY --from=builder /app/mobile ./mobile
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder --chown=65532:65532 /data /data
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3000/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["server/scripts/start.js"]
