const User = require("../User");
const Admin = require("../Admin");
const ChallengeRejection = require("../ChallengeRejection");

const ChallengeType = require("./ChallengeType");
const ChallengePlan = require("./ChallengePlan");
const ChallengePhase = require("./ChallengePhase");
const UserChallenge = require("./UserChallenge");
const AccountInstance = require("./AccountInstance");
const PhaseTransitionRequest = require("./PhaseTransitionRequest");

function setupChallengeAssociations() {
  // ChallengeType <-> ChallengePlan
  ChallengeType.hasMany(ChallengePlan, {
    foreignKey: "challenge_type_id",
    as: "plans",
  });
  ChallengePlan.belongsTo(ChallengeType, {
    foreignKey: "challenge_type_id",
    as: "type",
  });

  // ChallengeType <-> ChallengePhase
  ChallengeType.hasMany(ChallengePhase, {
    foreignKey: "challenge_type_id",
    as: "phases",
  });
  ChallengePhase.belongsTo(ChallengeType, {
    foreignKey: "challenge_type_id",
    as: "type",
  });

  // ChallengePlan <-> ChallengePhase
  ChallengePlan.hasMany(ChallengePhase, {
    foreignKey: "challenge_plan_id",
    as: "phases",
  });
  ChallengePhase.belongsTo(ChallengePlan, {
    foreignKey: "challenge_plan_id",
    as: "plan",
  });

  // User <-> UserChallenge
  User.hasMany(UserChallenge, {
    foreignKey: "user_id",
    as: "challenges",
  });
  UserChallenge.belongsTo(User, {
    foreignKey: "user_id",
    as: "user",
  });

  // Admin <-> UserChallenge
  Admin.hasMany(UserChallenge, {
    foreignKey: "admin_id",
    as: "managed_user_challenges",
  });
  UserChallenge.belongsTo(Admin, {
    foreignKey: "admin_id",
    as: "managed_by_admin",
  });

  // ChallengeType <-> UserChallenge
  ChallengeType.hasMany(UserChallenge, {
    foreignKey: "challenge_type_id",
    as: "user_challenges",
  });
  UserChallenge.belongsTo(ChallengeType, {
    foreignKey: "challenge_type_id",
    as: "type",
  });

  // ChallengePlan <-> UserChallenge
  ChallengePlan.hasMany(UserChallenge, {
    foreignKey: "challenge_plan_id",
    as: "user_challenges",
  });
  UserChallenge.belongsTo(ChallengePlan, {
    foreignKey: "challenge_plan_id",
    as: "plan",
  });

  // ChallengePhase <-> UserChallenge
  ChallengePhase.hasMany(UserChallenge, {
    foreignKey: "current_phase_id",
    as: "user_challenges",
  });
  UserChallenge.belongsTo(ChallengePhase, {
    foreignKey: "current_phase_id",
    as: "current_phase",
  });

  // User <-> AccountInstance
  User.hasMany(AccountInstance, {
    foreignKey: "user_id",
    as: "account_instances",
  });
  AccountInstance.belongsTo(User, {
    foreignKey: "user_id",
    as: "user",
  });

  // UserChallenge <-> AccountInstance
  UserChallenge.hasMany(AccountInstance, {
    foreignKey: { name: "user_challenge_id", allowNull: false },
    as: "account_instances",
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });

  AccountInstance.belongsTo(UserChallenge, {
    foreignKey: { name: "user_challenge_id", allowNull: false },
    as: "user_challenge",
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });

  // Admin <-> AccountInstance
  Admin.hasMany(AccountInstance, {
    foreignKey: "created_by_admin_id",
    as: "created_accounts",
  });
  AccountInstance.belongsTo(Admin, {
    foreignKey: "created_by_admin_id",
    as: "created_by_admin",
  });

  // User <-> PhaseTransitionRequest
  User.hasMany(PhaseTransitionRequest, {
    foreignKey: "user_id",
    as: "phase_transition_requests",
  });
  PhaseTransitionRequest.belongsTo(User, {
    foreignKey: "user_id",
    as: "user",
  });

  // UserChallenge <-> PhaseTransitionRequest
  UserChallenge.hasMany(PhaseTransitionRequest, {
    foreignKey: "user_challenge_id",
    as: "phase_transition_requests",
  });
  PhaseTransitionRequest.belongsTo(UserChallenge, {
    foreignKey: "user_challenge_id",
    as: "user_challenge",
  });

  // AccountInstance <-> PhaseTransitionRequest
  AccountInstance.hasMany(PhaseTransitionRequest, {
    foreignKey: "account_instance_id",
    as: "phase_transition_requests",
  });
  PhaseTransitionRequest.belongsTo(AccountInstance, {
    foreignKey: "account_instance_id",
    as: "account_instance",
  });

  // Admin <-> PhaseTransitionRequest
  Admin.hasMany(PhaseTransitionRequest, {
    foreignKey: "reviewed_by_admin_id",
    as: "reviewed_phase_requests",
  });
  PhaseTransitionRequest.belongsTo(Admin, {
    foreignKey: "reviewed_by_admin_id",
    as: "reviewed_by_admin",
  });

  // ChallengeType <-> ChallengeRejection
  ChallengeType.hasMany(ChallengeRejection, {
    foreignKey: "challenge_type_id",
    as: "rejections",
  });
  ChallengeRejection.belongsTo(ChallengeType, {
    foreignKey: "challenge_type_id",
    as: "challenge_type",
  });

  // UserChallenge <-> ChallengeRejection
  UserChallenge.hasOne(ChallengeRejection, {
    foreignKey: "user_challenge_id",
    as: "rejection",
  });
  ChallengeRejection.belongsTo(UserChallenge, {
    foreignKey: "user_challenge_id",
    as: "user_challenge",
  });
}

module.exports = setupChallengeAssociations;
