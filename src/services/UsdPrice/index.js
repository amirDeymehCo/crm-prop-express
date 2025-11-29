// services/currencyService.js
const axios = require("axios");
const Setting = require("../../models/Setting");

async function getDollarPrice() {
    try {
        // 1. گرفتن از API
        const { data } = await axios.get("https://api.tetherland.com/currencies", {
            timeout: 5000,
        });

        const usd = data?.data?.currencies?.USDT
        if (!usd) throw new Error("USD not found");

        const price = usd.price;

        await Setting.upsert({
            id: 1,
            dollar_price: price,
        });

        return { price, source: "api" };

    } catch (err) {
        console.error("Tetherland API error:", err.message);

        const setting = await Setting.findOne({ where: { id: 1 } });

        if (!setting) {
            throw new Error("No fallback price found");
        }

        return { price: setting.dollar_price, source: "db" };
    }
}

module.exports = { getDollarPrice };
