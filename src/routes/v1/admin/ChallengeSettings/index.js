const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const asyncHandler = require("../../../../utils/asyncHandler");
const { upload } = require("../../../../middlewares/upload");

router
  .get("/list-types", asyncHandler(Controller.listTypes))
  .get("/list-types/:id", asyncHandler(Controller.findType))
  .delete("/list-types/:id", asyncHandler(Controller.deleteType))
  .post(
    "/update-type/:id",
    upload.single("logo"),
    asyncHandler(Controller.updateType),
  )
  .get("/find-plan/:id", asyncHandler(Controller.findPlan))
  .get("/plans/:type_id", asyncHandler(Controller.plans))
  .post(
    "/create-type",
    upload.single("logo"),
    asyncHandler(Controller.createType),
  )
  .post("/create-plan", asyncHandler(Controller.createPlan))
  .post("/update-plan/:id", asyncHandler(Controller.updatePlan))
  .delete("/delete-plan/:id", asyncHandler(Controller.deletePlan));

module.exports = router;
