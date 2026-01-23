FROM node:20-alpine

WORKDIR /work

# Install vitest + TS so tests can run in the mounted workspace
RUN npm i -g vitest typescript

# (Optional) helpful if you later use ESM imports
ENV NODE_OPTIONS="--no-warnings"

CMD ["sh","-lc","vitest run"]
