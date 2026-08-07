const axios = require("axios");

// لیست لاگین‌هایی که می‌خواهی به CLOSE_ONLY تغییر وضعیت دهی
const loginsToClose = [
  1003838, 1003837, 1003836, 1003835, 1003832, 1003831, 1003829, 1003827,
  1003826, 1003825, 1003824, 1003823, 1003822, 1003821, 1003818, 1003816,
  1003815, 1003814, 1003812, 1003811, 1003807, 1003798,
]; // اینجا لاگین‌های خودت را قرار بده

const API_KEY = "Mylafjdto#@hreogfh436t3458Prop";
const API_URL = "http://23.88.5.228/ctrader-set-access-rights-api.php";

async function setAccessRights(login) {
  try {
    const response = await axios({
      method: "get", // طبق کد PHP تو، درخواست GET است
      url: API_URL,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      data: {
        login: login,
        access_rights: "CLOSE_ONLY", // مقدار مورد نظر تو
      },
    });

    console.log(`Success for ${login}:`, response.data);
  } catch (error) {
    console.error(`Error for ${login}:`, error.message);
  }
}

async function processLogins(logins) {
  console.log(`Starting process for ${logins.length} accounts...`);

  for (const login of logins) {
    // یک وقفه کوچک (مثلا 500 میلی‌ثانیه) بین درخواست‌ها برای جلوگیری از فشار به سرور
    await new Promise((resolve) => setTimeout(resolve, 500));
    await setAccessRights(login);
  }

  console.log("All operations finished.");
}

// شروع اجرا
processLogins(loginsToClose);
