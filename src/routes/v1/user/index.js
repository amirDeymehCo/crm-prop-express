const express = require("express");
const router = express.Router();
const walletRouter = require("./wallet");
const requestWidthdrawRouter = require("./requestWidthdraw");
const authRouter = require("../auth");
const profileRouter = require("./profile");
const ticketsRouter = require("./tickets");
const challengeRouter = require("./challenge");


router.use("/challenge", challengeRouter);
router.use("/tickets", ticketsRouter);
router.use("/requestWidthdraw", requestWidthdrawRouter);
router.use("/wallet", walletRouter);
router.use("/profile", profileRouter);
router.use("/auth", authRouter);


module.exports = router;

