FROM node:22-bookworm-slim
WORKDIR /app
COPY cloud/web/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY electron/health-cache.cjs electron/google-health-service.cjs electron/cloud-service.cjs electron/todo-store.cjs electron/habit-store.cjs electron/report-store.cjs electron/report-parser.cjs electron/report-fields.cjs electron/reports-worker.cjs ./electron/
COPY cloud/web/*.mjs ./
COPY dist ./public
ENV NODE_ENV=production PORT=3200 DATA_DIR=/data TZ=Asia/Kolkata
USER node
CMD ["node", "server.mjs"]
