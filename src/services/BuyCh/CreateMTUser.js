const axios = require("axios");

async function createMTUser({
    order_id,
    emailuser,
    leverge,
    groupch,
    mPassword,
    inPassword,
    balance,
    eod_role,
    start_balance_role,
    eod_relative
}) {
    try {
        const url = "http://23.88.5.228/create_login.php";

        const data = {
            FirstName: order_id,
            LastName: "",
            Mail: emailuser,
            Phone: "",
            Leverage: leverge,
            Group: groupch, // get by type plan
            MainPass: mPassword,
            InvestorPass: inPassword,
            Balance: balance,
            Country: "",
            City: "",
            Address: "",
            ZipCode: "",
            EODRole: eod_role, // ریسک روزانه
            EOWRole: 0.0,
            EOMRole: 0.0,
            StartBalanceRole: start_balance_role, // ریسک کلی
            StartBalanceRoleInc: 0.0,
            RelativeByNowBalanceRole: 0, // 
            RelativeByStartBalanceRole: 0.0,
            RelativeByEODBalanceRole: eod_relative, // ریسک شناور
            RelativeByEOWBalanceRole: 0.0,
            RelativeByEOMBalanceRole: 0.0,
            PositionEODRole: 0.0,
            PositionEOWRole: 0.0,
            PositionEOMRole: 0.0,
            PositionStartBalanceRole: 0.0,
            PositionNowBalanceRole: 0.0
        };

        const headers = {
            "X-API-Key": "Mylafjdto#@hreogfh436t3458Prop",
            "Content-Type": "application/json"
        };

        console.log("SEnd data>");
        console.log(data)

        const response = await axios.post(url, data, { headers });

        return response.data;  // اطلاعات خروجی از سرور متاترید
    } catch (err) {
        console.error("MT5 Create User Error:", err?.response?.data || err.message);
        throw new Error("Failed to create MT user");
    }
}


module.exports = createMTUser
