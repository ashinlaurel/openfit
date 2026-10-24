FROM node:22-alpine
ENV NODE_ENV=production PORT=3100 DATA_DIR=/data
WORKDIR /app
COPY cloud/server.mjs ./server.mjs
COPY cloud/exercise-names.json ./exercise-names.json
USER node
EXPOSE 3100
CMD ["node", "server.mjs"]
