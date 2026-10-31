FROM node:22-alpine
ENV NODE_ENV=production PORT=3100 DATA_DIR=/data
WORKDIR /app
COPY cloud/server.mjs ./server.mjs
COPY cloud/body-history.cjs ./body-history.cjs
COPY cloud/health-history.cjs ./health-history.cjs
COPY cloud/health-connect.cjs ./health-connect.cjs
COPY cloud/exercise-names.json ./exercise-names.json
USER node
EXPOSE 3100
CMD ["node", "server.mjs"]
