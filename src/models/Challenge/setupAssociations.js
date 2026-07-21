const User = require("../User");
const Admin = require("../Admin");
const ChallengeRejection = require("../ChallengeRejection");

const ChallengeType = require("./ChallengeType");
const ChallengePlan = require("./ChallengePlan");
const ChallengePhase = require("./ChallengePhase");
const UserChallenge = require("./UserChallenge");
const AccountInstance = require("./AccountInstance");
const PhaseTransitionRequest = require("./PhaseTransitionRequest");
const HistoryChallenge = require("./HistoryChallenge");
const PayoutRequest = require("./PayoutRequest");

function setupChallengeAssociations() {
  ChallengeType.hasMany(ChallengePlan, {
    foreignKey: "challenge_type_id",
  });
  ChallengePlan.belongsTo(ChallengeType, {
    foreignKey: "challenge_type_id",
  });

  ChallengeType.hasMany(ChallengePhase, {
    foreignKey: "challenge_type_id",
  });
  ChallengePhase.belongsTo(ChallengeType, {
    foreignKey: "challenge_type_id",
  });

  ChallengePlan.hasMany(ChallengePhase, {
    foreignKey: "challenge_plan_id",
  });
  ChallengePhase.belongsTo(ChallengePlan, {
    foreignKey: "challenge_plan_id",
  });

  User.hasMany(UserChallenge, {
    foreignKey: "user_id",
  });
  UserChallenge.belongsTo(User, {
    foreignKey: "user_id",
  });

  Admin.hasMany(UserChallenge, {
    foreignKey: "admin_id",
    as: "managed_user_challenges",
  });
  UserChallenge.belongsTo(Admin, {
    foreignKey: "admin_id",
    as: "managed_by_admin",
  });

  ChallengeType.hasMany(UserChallenge, {
    foreignKey: "challenge_type_id",
  });
  UserChallenge.belongsTo(ChallengeType, {
    foreignKey: "challenge_type_id",
  });

  ChallengePlan.hasMany(UserChallenge, {
    foreignKey: "challenge_plan_id",
  });

  UserChallenge.belongsTo(ChallengePlan, {
    foreignKey: "challenge_plan_id",
  });

  ChallengePhase.hasMany(UserChallenge, {
    foreignKey: "current_phase_id",
  });

  UserChallenge.belongsTo(ChallengePhase, {
    foreignKey: "current_phase_id",
  });

  User.hasMany(AccountInstance, {
    foreignKey: "user_id",
  });
  AccountInstance.belongsTo(User, {
    foreignKey: "user_id",
  });

  UserChallenge.hasMany(AccountInstance, {
    foreignKey: "user_challenge_id",
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });
  AccountInstance.belongsTo(UserChallenge, {
    foreignKey: "user_challenge_id",
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });

  Admin.hasMany(AccountInstance, {
    foreignKey: "created_by_admin_id",
    as: "created_accounts",
  });
  AccountInstance.belongsTo(Admin, {
    foreignKey: "created_by_admin_id",
    as: "created_by_admin",
  });

  User.hasMany(PhaseTransitionRequest, {
    foreignKey: "user_id",
  });
  PhaseTransitionRequest.belongsTo(User, {
    foreignKey: "user_id",
  });

  UserChallenge.hasMany(PhaseTransitionRequest, {
    foreignKey: "user_challenge_id",
  });
  PhaseTransitionRequest.belongsTo(UserChallenge, {
    foreignKey: "user_challenge_id",
  });

  AccountInstance.hasMany(PhaseTransitionRequest, {
    foreignKey: "account_instance_id",
  });
  PhaseTransitionRequest.belongsTo(AccountInstance, {
    foreignKey: "account_instance_id",
  });

  Admin.hasMany(PhaseTransitionRequest, {
    foreignKey: "reviewed_by_admin_id",
    as: "reviewed_phase_requests",
  });
  PhaseTransitionRequest.belongsTo(Admin, {
    foreignKey: "reviewed_by_admin_id",
  });

  User.hasMany(PayoutRequest, {
    foreignKey: "user_id",
  });
  PayoutRequest.belongsTo(User, {
    foreignKey: "user_id",
  });

  UserChallenge.hasMany(PayoutRequest, {
    foreignKey: "user_challenge_id",
  });
  PayoutRequest.belongsTo(UserChallenge, {
    foreignKey: "user_challenge_id",
  });

  AccountInstance.hasMany(PayoutRequest, {
    foreignKey: "account_instance_id",
  });
  PayoutRequest.belongsTo(AccountInstance, {
    foreignKey: "account_instance_id",
  });

  Admin.hasMany(PayoutRequest, {
    foreignKey: "reviewed_by_admin_id",
    as: "reviewed_payout_requests",
  });
  PayoutRequest.belongsTo(Admin, {
    foreignKey: "reviewed_by_admin_id",
  });

  UserChallenge.hasMany(HistoryChallenge, {
    foreignKey: "user_challenge_id",
  });
  HistoryChallenge.belongsTo(UserChallenge, {
    foreignKey: "user_challenge_id",
  });

  Admin.hasMany(HistoryChallenge, {
    foreignKey: "admin_id",
  });
  HistoryChallenge.belongsTo(Admin, {
    foreignKey: "admin_id",
  });

  ChallengeType.hasMany(ChallengeRejection, {
    foreignKey: "challenge_type_id",
  });
  ChallengeRejection.belongsTo(ChallengeType, {
    foreignKey: "challenge_type_id",
  });

  UserChallenge.hasOne(ChallengeRejection, {
    foreignKey: "user_challenge_id",
  });
  ChallengeRejection.belongsTo(UserChallenge, {
    foreignKey: "user_challenge_id",
  });
}

module.exports = setupChallengeAssociations;
