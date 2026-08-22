FROM node:20-bookworm-slim

# نصب مرورگر کرومیوم و فونت‌های فارسی/عربی برای نمایش درست PDF
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-noto-core \
    fonts-freefont-ttf \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# جلوگیری از دانلود کروم توسط خودِ پاپتیر (چون بالا نصب کردیم)
ENV PUPPETEER_SKIP_DOWNLOAD=true
# آدرس مرورگر برای استفاده در کد Node.js
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production

COPY package*.json ./

# استفاده از npm ci برای نصب دقیق طبق lockfile
RUN npm ci --omit=dev

COPY . .

EXPOSE 8000

# اجرای مستقیم با node (بهینه‌تر از nodemon برای داکر پروادکشن)
CMD ["node", "src/index.js"]