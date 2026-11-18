FROM node:26-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev --no-package-lock
COPY server ./server
COPY scripts ./scripts
COPY web/dist ./web/dist
ENV NODE_ENV=production PORT=7823
EXPOSE 7823
USER node
CMD ["node", "server/src/index.js"]
