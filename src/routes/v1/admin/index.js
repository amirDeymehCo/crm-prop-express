const express = require("express");
const router = express.Router();
const customerRouter = require("./customer");
const usersRouter = require("./users");
const ticketsRouter = require("./tickets");
const challengeRouter = require("./Challenge");
const couponsRouter = require("./coupons");
const listFindsRouter = require("./listFinds");

router.use("/users", usersRouter);
router.use("/customer", customerRouter);
router.use("/listFinds", listFindsRouter);
router.use("/tickets", ticketsRouter);
router.use("/challenge", challengeRouter);
router.use("/coupons", couponsRouter);

module.exports = router;
