const express = require("express");
const router = express.Router();
const asyncHandler = require("../../../../utils/asyncHandler");
const Controller = require("./controller");
const { upload } = require("../../../../middlewares/upload");
const validator = require("./validation");

router
  .get("/", asyncHandler(Controller.list))
  .get("/:id", asyncHandler(Controller.find))
  .post("/update-reqeust", asyncHandler(Controller.updateReqeust));

module.exports = router;
