const cron = require("node-cron");
const axios = require("axios");
const Setting = require("../../models/Setting");

async function updatePrice() {
  try {
    const { data } = await axios.get("https://api.tetherland.com/currencies", {
      timeout: 5000,
    });

    const usd = data?.data?.currencies?.USDT;
    if (!usd) throw new Error("USD not found");

    await Setting.upsert({
      id: 1,
      dollar_price: usd.price,
    });

    console.log("Dollar price updated:", usd.price);
  } catch (error) {
    console.error("Error updating dollar price:", error.message);
  }
}

// اجرای کرون‌جاب هر 12 ساعت
cron.schedule("0 */12 * * *", () => {
  console.log("Running USD price updater...");
  updatePrice();
});

module.exports = updatePrice;
