const Controllers = require("../../../controllers");
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const QRCode = require("qrcode");
const dayjs = require("dayjs");
const { v4: uuid } = require("uuid");
const User = require("../../../../models/User");
const Certificates = require("../../../../models/Certificates");
const founcList = require("../../../../utils/List");

const { getCertificateHTML } = require("../../../../utils/certificateTemplate");

const Controller = class extends Controllers {
  async createWithdrawalCertificate(req, res) {
    try {
      const {
        firstname,
        lastname,
        date,
        total_profit,
        user_id,
        withdraw_profit,
      } = req.body;

      let fullName = `${firstname} ${lastname}`;

      if (user_id) {
        const findUser = await User.findByPk(user_id);
        if (!findUser)
          return this.response({
            res,
            status: 400,
            message: "شناسه ارسالی گاربر اشتباه است",
          });

        fullName = findUser.firstname + " " + findUser.lastname;
      } else if (!firstname || !lastname) {
        return this.response({
          res,
          status: 400,
          message: "ارسال نام و نام خانوادگی اجباری است",
        });
      }

      const formattedDate = dayjs(date).format("DD MMMM YYYY");
      const certificateId = uuid();

      const qrData = await QRCode.toDataURL(
        "https://api.myprop.trade/" +
          `certificates/withdraw-${certificateId}.png`,
      );

      const html = getCertificateHTML({
        fullName,
        total_profit,
        formattedDate,
        qrData,
      });

      const browser = await puppeteer.launch({
        headless: "new",
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      });

      const page = await browser.newPage();

      // ✅ مهم
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

      const filePath = path.join(outputDir, `withdraw-${certificateId}.png`);

      await page.screenshot({
        path: filePath,
        type: "png",
        fullPage: false,
      });

      await browser.close();

      const newCart = await Certificates.create({
        type: "withdraw",
        url_file: `certificates/withdraw-${certificateId}.png`,
        fullname: fullName,
        date,
        total_profit,
        withdraw_profit,
        user_id,
      });

      this.response({ res, message: "گواهینامه با موفقیت ایجاد شد" });
    } catch (err) {
      console.error(err);
      res.status(500).json({
        message: "Error generating certificate",
        data: err.toString(),
      });
    }
  }
  async listCarts(req, res) {
    const where = {};
    if (req?.query?.user_id) where.user_id = req?.query?.user_id;
    if (req?.query?.type) where.type = req?.query?.type;

    const list = await founcList(Certificates, req, where, {
      include: [{ model: User, attributes: ["id", "avatar"] }],
    });

    this.response({ res, status: 200, data: list });
  }
  async deleteCart(req, res) {
    const find = await Certificates.destroy({ where: { id: req?.params?.id } });

    if (!find) {
      return this.response({
        res,
        status: 400,
        message: "شناسه ارسالی اشتباه است",
      });
    }

    this.response({ res, status: 200, message: "گواهینامه با موفقیت حذف شد" });
  }
};

module.exports = new Controller();
