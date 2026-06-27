const express = require("express");
const router = express.Router();
const customerRouter = require("./customer");
const usersRouter = require("./users");
const ticketsRouter = require("./tickets");
const challengeRouter = require("./Challenge");
const couponsRouter = require("./coupons");
const kycRouter = require("./kyc");
const listFindsRouter = require("./listFinds");
const adminsRouter = require("./admins");
const profileRouter = require("./profile");
const certificatesRouter = require("./certificates");
const challengeSettingsRouter = require("./ChallengeSettings");
const walletWithdrawRouter = require("./walletWithdraw");

router.use("/users", usersRouter);
router.use("/customer", customerRouter);
router.use("/listFinds", listFindsRouter);
router.use("/tickets", ticketsRouter);
router.use("/challenge", challengeRouter);
router.use("/coupons", couponsRouter);
router.use("/kyc", kycRouter);
router.use("/admins", adminsRouter);
router.use("/certificates", certificatesRouter);
router.use("/profile", profileRouter);
router.use("/challenge-settings", challengeSettingsRouter);
router.use("/wallet-withdraw", walletWithdrawRouter);

module.exports = router;
