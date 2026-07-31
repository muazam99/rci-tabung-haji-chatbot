FROM node:20-slim AS deps
WORKDIR /app
COPY package*.json ./

# force optional + explicitly install lightningcss native binary
RUN npm ci --include=optional \
&& npm i lightningcss-linux-x64-gnu@1.30.2 @tailwindcss/oxide-linux-x64-gnu --no-save \
&& node -e "require('lightningcss'); require('@tailwindcss/oxide'); console.log('native css deps ok')"

FROM node:20-slim AS builder

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node","server.js"]
