# Stage 1: build, installa tutte le dipendenze (incluse quelle di sviluppo) e copia i sorgenti
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src ./src
COPY scripts ./scripts
COPY tests ./tests
COPY jest.config.js ./

# Stage 2: test, esegue lint e test con coverage, la build fallisce se falliscono
FROM build AS test
RUN npm run lint
RUN npm run test:coverage

# Stage 3: prod, immagine finale minimale con solo le dipendenze di produzione
FROM node:20-alpine AS prod
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=test /app/src ./src
EXPOSE 3000
CMD ["node", "src/app.js"]