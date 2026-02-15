const axios = require("axios");

// ✅ اعتبارسنجی کد ملی
function isValidNationalCode(code) {
  if (!/^\d{10}$/.test(code)) return false;

  const check = parseInt(code[9], 10);
  let sum = 0;

  for (let i = 0; i < 9; i++) {
    sum += parseInt(code[i], 10) * (10 - i);
  }

  const remainder = sum % 11;

  return (
    (remainder < 2 && check === remainder) ||
    (remainder >= 2 && check === 11 - remainder)
  );
}

async function shahkarInquiry(mobile, nationalCode) {
  try {
    // ✅ ولیدیشن قبل از API
    if (!/^09\d{9}$/.test(mobile)) {
      return {
        success: false,
        matched: null,
        code: "INVALID_MOBILE",
        message: "شماره موبایل نامعتبر است",
      };
    }

    if (!isValidNationalCode(nationalCode)) {
      return {
        success: false,
        matched: null,
        code: "INVALID_NATIONAL_CODE",
        message: "کد ملی نامعتبر است",
      };
    }

    const response = await axios.post(
      "https://api.zibal.ir/v1/facility/shahkarInquiry",
      {
        mobile,
        nationalCode,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer 5c3629a47797455e850d1e66211b281e",
        },
        timeout: 10000,
      },
    );

    const matched = response?.data?.data?.matched;

    if (matched === true) {
      return {
        success: true,
        matched: true,
        code: "MATCHED",
        message: "این شماره موبایل متعلق به این شماره ملی هست",
      };
    }

    if (matched === false) {
      return {
        success: false,
        matched: false,
        code: "NOT_MATCHED",
        message: "این شماره موبایل متعلق به این فرد نیست",
      };
    }

    return {
      success: false,
      matched: null,
      code: "UNKNOWN_RESPONSE",
      message: "پاسخ نامعتبر از سرویس شاهکار",
    };
  } catch (error) {
    // ✅ خطای برگشتی از Zibal (مثلاً 400)
    if (error.response?.data) {
      return {
        success: false,
        matched: null,
        code: `ZIBAL_${error.response.data.result}`,
        message: error.response.data.message,
        status: error.response.status,
      };
    }

    // ✅ تایم‌اوت / قطع ارتباط
    if (error.request) {
      return {
        success: false,
        matched: null,
        code: "NO_RESPONSE",
        message: "عدم دریافت پاسخ از سرویس شاهکار",
      };
    }

    // ✅ خطای داخلی
    return {
      success: false,
      matched: null,
      code: "INTERNAL_ERROR",
      message: "خطای داخلی سرور",
    };
  }
}

module.exports = shahkarInquiry;
