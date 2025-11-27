const express = require("express");
const router = express.Router();
const walletRouter = require("./wallet");
const authRouter = require("../auth");
const ticketsRouter = require("./tickets");


router.use("/tickets", ticketsRouter);
router.use("/wallet", walletRouter);
router.use("/auth", authRouter);


module.exports = router;

