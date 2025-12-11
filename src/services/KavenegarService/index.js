const axios = require("axios");

const KAVENEGAR_API_KEY = process.env.KAVENEGAR_API_KEY; // تو .env بذار
const SENDER_NUMBER = process.env.KAVENEGAR_SENDER || ""; // اگه خط اختصاصی داری

function generateCode(len = 6) {
    return Math.floor(10 ** (len - 1) + Math.random() * 9 * 10 ** (len - 1)).toString();
}

// برای الگوهای کاوه نگار (Lookup)
async function sendCode({ receptor, token, template = "myprop" }) {
    try {
        const url = `https://api.kavenegar.com/v1/${KAVENEGAR_API_KEY}/verify/lookup.json`;

        const { data } = await axios.get(url, {
            params: {
                receptor,
                token,
                template,
                sender: SENDER_NUMBER
            },
            timeout: 10000,
        });

        console.log("Kavenegar response:", data);
        return data;
    } catch (error) {
        console.error("Kavenegar send error:", error?.response?.data || error.message);
        throw new Error("خطا در ارسال پیامک تأیید");
    }
}


async function sendCustomMessage({ receptor, message }) {
    try {
        const url = `https://api.kavenegar.com/v1/${KAVENEGAR_API_KEY}/sms/send.json`;

        const { data } = await axios.get(url, {
            params: {
                receptor,
                message,
                sender: SENDER_NUMBER
            },
            timeout: 10000,
        });

        return data;
    } catch (error) {
        throw new Error("خطا در ارسال پیام دلخواه");
    }
}

module.exports = {
    sendCode,
    generateCode,
    sendCustomMessage
};
