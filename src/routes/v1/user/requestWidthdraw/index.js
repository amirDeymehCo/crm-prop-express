const express = require("express");
const validator = require("./validation");
const router = express.Router();
const Controller = require("./controller");
const asyncHandler = require("../../../../utils/asyncHandler");

router.post("/widthdrawRequest", validator.widthdrawRequest(), Controller.validationBody, asyncHandler(Controller.widthdrawRequestFounc))


module.exports = router;
