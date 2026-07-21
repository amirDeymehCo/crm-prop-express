// services/trading/providers/mt5.js
const axios = require("axios");

async function createAccount({
  order_id,
  emailuser,
  leverge,
  groupch,
  mPassword,
  inPassword,
  balance,
  eod_role,
  start_balance_role,
  eod_relative,
}) {
  try {
    const url = "http://23.88.5.228/create_login.php";

    const data = {
      FirstName: order_id,
      LastName: "",
      Mail: emailuser,
      Phone: "",
      Leverage: leverge,
      Group: groupch,
      MainPass: mPassword,
      InvestorPass: inPassword,
      Balance: balance,
      Country: "",
      City: "",
      Address: "",
      ZipCode: "",
      EODRole: eod_role,
      EOWRole: 0.0,
      EOMRole: 0.0,
      StartBalanceRole: start_balance_role,
      StartBalanceRoleInc: 0.0,
      RelativeByNowBalanceRole: 0,
      RelativeByStartBalanceRole: 0.0,
      RelativeByEODBalanceRole: eod_relative,
      RelativeByEOWBalanceRole: 0.0,
      RelativeByEOMBalanceRole: 0.0,
      PositionEODRole: 0.0,
      PositionEOWRole: 0.0,
      PositionEOMRole: 0.0,
      PositionStartBalanceRole: 0.0,
      PositionNowBalanceRole: 0.0,
    };

    const headers = {
      "X-API-Key": "Mylafjdto#@hreogfh436t3458Prop",
      "Content-Type": "application/json",
    };

    const response = await axios.post(url, data, { headers });
    return response.data;
  } catch (err) {
    console.error("MT5 Create User Error:", err?.response?.data || err.message);
    throw new Error("Failed to create MT user");
  }
}

module.exports = { createAccount };
