const express = require("express");
const router = express.Router();
const customerRouter = require("./customer");

router.use("/customer", customerRouter);


module.exports = router;

