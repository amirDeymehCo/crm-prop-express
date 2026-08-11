const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const dayjs = require("dayjs");
const { v4: uuid } = require("uuid");
const { getCertificateHTMLPhase } = require("./certificateTemplatePhase");
const { default: puppeteer } = require("puppeteer");
const Certificates = require("../models/Certificates");

async function createPhaseCertificate({
  user_id,
  phase,
  total_profit,
  withdraw_profit = 0,
  fullName,
  userChallengeId = null,
}) {
  const date = new Date();
  const certificateId = uuid();
  const formattedDate = dayjs(date).format("DD MMMM YYYY");

  const fileName = `phase-${phase}-${certificateId}.png`;

  const qrData = await QRCode.toDataURL(fileName);

  const html = getCertificateHTMLPhase({
    fullName,
    qrData,
    formattedDate,
    phase,
  });

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });
  const page = await browser.newPage();

  await page.setViewport({
    width: 1123,
    height: 794,
    deviceScaleFactor: 2,
  });

  await page.setContent(html, { waitUntil: "load" });

  const outputDir = path.join(process.cwd(), "public/certificates");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filePath = path.join(outputDir, fileName);

  await page.screenshot({
    path: filePath,
    type: "png",
    fullPage: false,
  });

  await browser.close();

  return Certificates.create({
    type: `steep${phase}`,
    url_file: `certificates/${fileName}`,
    fullname: fullName,
    date,
    total_profit,
    withdraw_profit,
    user_id,
    userChallengeId,
  });
}

module.exports = createPhaseCertificate;
