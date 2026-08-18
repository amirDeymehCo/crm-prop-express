// services/currencyService.js
const axios = require("axios");
const Setting = require("../../models/Setting");

async function getDollarPrice() {
  try {
    const setting = await Setting.findOne({ where: { id: 1 } });

    if (!setting) {
      throw new Error("No fallback price found");
    }

    return {
      price: Number(setting.dollar_price) + Number(setting?.bonus_dollar),
      source: "db",
    };
  } catch (err) {
    console.error("Tetherland API error:", err.message);

    const setting = await Setting.findOne({ where: { id: 1 } });

    if (!setting) {
      throw new Error("No fallback price found");
    }

    return {
      price: Number(setting.dollar_price) + Number(setting?.bonus_dollar),
      source: "db",
    };
  }
}

module.exports = { getDollarPrice };
