// services/trading/providers/ctrader.js
const axios = require("axios");

const CTRADER_CREATE_URL =
  process.env.CTRADER_CREATE_URL ||
  "http://23.88.5.228/ctrader-create-account-api.php";
const CTRADER_API_KEY =
  process.env.CTRADER_API_KEY || "Mylafjdto#@hreogfh436t3458Prop";

function assertRequired(value, name) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required : ${name}`);
  }
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function createAccount({
  email,
  first_name,
  last_name,
  balance,
  groupch,
  leverge,
  // daily_risk_percent,
  // overall_risk_percent,
  // floating_risk_percent,
}) {
  console.log("leverage=>>>", leverge);

  try {
    assertRequired(email, "email");
    assertRequired(first_name, "first_name");
    assertRequired(last_name, "last_name");
    assertRequired(groupch, "groupch");

    const payload = {
      email,
      first_name,
      last_name,
      balance: toNumber(balance),
      group_name: groupch,
      leverage: toNumber(leverge),
      daily_risk_percent: 0,
      overall_risk_percent: 0,
      floating_risk_percent: 0,
    };

    const response = await axios.request({
      method: "GET",
      url: CTRADER_CREATE_URL,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": CTRADER_API_KEY,
      },
      data: payload,
      timeout: 30000,
      maxRedirects: 10,
      validateStatus: () => true,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `cTrader create account failed with HTTP ${response.status}: ${JSON.stringify(response.data)}`,
      );
    }

    const data = response.data;

    return {
      provider: "ctrader",
      ok: Boolean(data?.ok),
      external_account_id: data?.ctid_user_id ?? null,
      login: data?.login ?? null,
      password: data?.password ?? null,
      investor_password: data?.investor_password ?? null,
      group: data?.group ?? payload.groupch,
      leverage: data?.leverage ?? payload.leverage,
      balance: data?.balance ?? payload.balance,
      email: data?.email ?? payload.email,
      ctid_user_id: data?.ctid_user_id ?? null,
      ctid_error: data?.ctid_error ?? null,
      risk_stop_registered: Boolean(data?.risk_stop_registered),
      risk_stop_response: data?.risk_stop_response ?? null,
      raw: data,
    };
  } catch (err) {
    console.error(
      "cTrader Create Account Error:",
      err?.response?.data || err.message,
    );
    throw new Error("Failed to create cTrader account");
  }
}

module.exports = { createAccount };
