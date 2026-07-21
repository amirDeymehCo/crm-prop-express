// services/trading/providers/ctrader.js
async function createAccount(payload) {
  // TODO: call cTrader API
  // map common payload -> cTrader fields
  return {
    provider: "ctrader",
    status: "pending",
    raw: {},
  };
}

module.exports = { createAccount };
