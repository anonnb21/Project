FROM node:24.6.0-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN apk add --no-cache python3 make g++ && npm ci --omit=dev

FROM node:24.6.0-alpine
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache tini && addgroup -S app && adduser -S -G app app
COPY --from=dependencies /app/node_modules ./node_modules
COPY --chown=app:app package.json ./
COPY --chown=app:app src ./src
COPY --chown=app:app public ./public
RUN mkdir /app/data && chown app:app /app/data
USER app
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
