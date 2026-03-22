FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=./data/database.duckdb
ENV UPLOAD_DIR=./uploads

EXPOSE 3001

CMD ["node", "dist/index.js"]
