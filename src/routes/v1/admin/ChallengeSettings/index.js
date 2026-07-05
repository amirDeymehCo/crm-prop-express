const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const asyncHandler = require("../../../../utils/asyncHandler");
const { upload } = require("../../../../middlewares/upload");
const can = require("../../../../middlewares/can");

router
  .get("/list-types", can("JUST_SUPER"), asyncHandler(Controller.listTypes))
  .get("/list-types/:id", can("JUST_SUPER"), asyncHandler(Controller.findType))
  .delete(
    "/list-types/:id",
    can("JUST_SUPER"),
    asyncHandler(Controller.deleteType),
  )
  .post(
    "/update-type/:id",
    upload.single("logo"),
    can("JUST_SUPER"),
    asyncHandler(Controller.updateType),
  )
  .get("/find-plan/:id", can("JUST_SUPER"), asyncHandler(Controller.findPlan))
  .get("/plans/:type_id", can("JUST_SUPER"), asyncHandler(Controller.plans))
  .post(
    "/create-type",
    upload.single("logo"),
    can("JUST_SUPER"),
    asyncHandler(Controller.createType),
  )
  .post("/create-plan", can("JUST_SUPER"), asyncHandler(Controller.createPlan))
  .post(
    "/update-plan/:id",
    can("JUST_SUPER"),
    asyncHandler(Controller.updatePlan),
  )
  .delete(
    "/delete-plan/:id",
    can("JUST_SUPER"),
    asyncHandler(Controller.deletePlan),
  )
  .get(
    "/phase-list/:plan_id",
    can("JUST_SUPER"),
    asyncHandler(Controller.phaseList),
  )
  .get("/find-phase/:id", can("JUST_SUPER"), asyncHandler(Controller.findPhase))
  .post(
    "/create-phase",
    can("JUST_SUPER"),
    asyncHandler(Controller.createPhase),
  )
  .delete(
    "/phase-delete/:phase_id",
    can("JUST_SUPER"),
    asyncHandler(Controller.deletePhase),
  );

module.exports = router;
