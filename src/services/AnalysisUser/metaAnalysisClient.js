const axios = require("axios");
const axiosRetry = require("axios-retry").default;

const client = axios.create({
  baseURL: process.env.META_ANALYSIS_BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

axiosRetry(client, {
  retries: 2,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (err) =>
    err.code === "ECONNABORTED" ||
    err.code === "ECONNREFUSED" ||
    err.code === "ENOTFOUND",
});

async function callMeta(endpoint, payload, apiKey) {
  try {
    const { data, status } = await client.post(endpoint, payload, {
      headers: {
        "X-API-Key": apiKey,
      },
    });

    console.log(endpoint, "  ", data);

    if (status !== 200) return "ERRRORED";
    if (!data?.ok) return "ERRORED";

    return data;
  } catch (err) {
    return null;
  }
}

module.exports = { callMeta };
