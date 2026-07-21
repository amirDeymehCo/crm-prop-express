const createMTUser = require("./CreateMTUser");
const createCTraider = require("./CreateCTraider");

const providers = {
  mt5: createMTUser,
  ctrader: createCTraider,
};

async function createTradingAccount({ provider, ...payload }) {
  const adapter = providers[provider];

  if (!adapter) {
    throw new Error(`Unsupported trading provider: ${provider}`);
  }

  return adapter.createAccount(payload);
}

module.exports = createTradingAccount;
