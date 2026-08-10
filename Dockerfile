FROM node:20

WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV NODE_ENV=production

COPY package*.json ./

RUN npx puppeteer browsers install chrome
RUN npm install -g nodemon
RUN npm install

COPY . .

EXPOSE 8000

CMD ["npm", "start"]
