const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),

  // برای پورت 465 باید true باشد
  secure: true,

  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },

  // در حالت عادی لازم نیست؛ فقط اگر گواهی SSL سرور ایمیل مشکل داشت
  // tls: {
  //   rejectUnauthorized: false,
  // },
});

async function verifyMailConnection() {
  try {
    await transporter.verify();
    console.log("✅ SMTP connection established successfully");
  } catch (error) {
    console.error("❌ SMTP connection failed:", error.message);
  }
}

async function sendOtpEmail({ to, code }) {
  return transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject: "کد ورود به حساب MyProp",
    text: `کد تأیید ورود شما: ${code}. این کد تا ۵ دقیقه معتبر است.`,

    html: `
      <!doctype html>
      <html lang="fa" dir="rtl">
        <body style="margin:0;background:#f6f7fb;font-family:Tahoma,Arial,sans-serif;padding:24px;">
          <div style="max-width:540px;margin:auto;background:#fff;border-radius:14px;padding:32px;text-align:center;">
            <h2 style="margin:0 0 16px;color:#111827;">ورود به MyProp</h2>

            <p style="color:#4b5563;line-height:1.9;">
              کد تأیید ورود به حساب شما:
            </p>

            <div style="
              display:inline-block;
              direction:ltr;
              letter-spacing:10px;
              font-size:30px;
              font-weight:bold;
              color:#111827;
              background:#f3f4f6;
              padding:14px 20px;
              border-radius:10px;
              margin:8px 0 20px;
            ">
              ${code}
            </div>

            <p style="color:#6b7280;font-size:13px;line-height:1.8;">
              این کد تا ۵ دقیقه معتبر است.<br />
              اگر شما درخواست ورود نداده‌اید، این ایمیل را نادیده بگیرید.
            </p>
          </div>
        </body>
      </html>
    `,
  });
}

module.exports = {
  transporter,
  verifyMailConnection,
  sendOtpEmail,
};
