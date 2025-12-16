const express = require("express");
const router = express.Router();
const customerRouter = require("./customer");
const challengeRouter = require("./Challenge");

router.use("/customer", customerRouter);
router.use("/challenge", challengeRouter);


module.exports = router;

