const express = require("express");
const router = express.Router();
const asyncHandler = require("../../../../utils/asyncHandler");
const Controller = require("./controller");

router.get("/users", asyncHandler(Controller.users));

module.exports = router;
