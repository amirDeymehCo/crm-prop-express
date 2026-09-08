const express = require("express");
const router = express.Router();
const walletRouter = require("./wallet");
const requestWidthdrawRouter = require("./requestWidthdraw");
const listFindsRouter = require("./listFinds");
const authRouter = require("../auth");
const profileRouter = require("./profile");
const certificatesRouter = require("./certificates");
const ticketsRouter = require("./tickets");
const challengeRouter = require("./challenge");
const tasksRouter = require("./tasks");

router.use("/listFinds", listFindsRouter);
router.use("/auth", authRouter);
router.use("/challenge", challengeRouter);
router.use("/tickets", ticketsRouter);
router.use("/requestWidthdraw", requestWidthdrawRouter);
router.use("/wallet", walletRouter);
router.use("/profile", profileRouter);
router.use("/certificates", certificatesRouter);
router.use("/tasks", tasksRouter);

module.exports = router;
