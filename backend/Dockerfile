FROM node:18

WORKDIR /app

COPY package*.json ./
COPY scripts/verifyPgInstall.js ./scripts/verifyPgInstall.js

RUN npm ci --omit=dev && npm run verify:pg

COPY . .

EXPOSE 8080

CMD [ "npm", "start" 