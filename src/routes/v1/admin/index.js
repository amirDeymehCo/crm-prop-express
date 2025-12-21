const express = require("express");
const router = express.Router();
const customerRouter = require("./customer");
const usersRouter = require("./users");
const challengeRouter = require("./Challenge");

router.use("/users", usersRouter);
router.use("/customer", customerRouter);
router.use("/challenge", challengeRouter);


module.exports = router;

