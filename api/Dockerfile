FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app
COPY server.mjs ./
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
