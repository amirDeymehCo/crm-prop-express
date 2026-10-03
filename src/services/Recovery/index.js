const constants = require("./constants");
const helpers = require("./helpers");
const pricing = require("./pricing");
const { lookupRecoveryAccounts, INELIGIBLE } = require("./lookupAccounts");
const {
  createRecoveryOffer,
  createRecoveryOrder,
  cancelOpenOffers,
} = require("./createOffer");
const {
  getRecoveryOffer,
  cancelRecoveryOffer,
  listUserRecoveries,
  getPayableRecoveryOrder,
  serializeRecovery,
  getOpenRecoveryMap,
  attachRecoveryToChallenges,
  getRecoveryAdminMap,
  attachRecoveryToAdminChallenges,
  listChallengeRecoveries,
} = require("./offers");
const {
  finalizeRecoveryAfterPaid,
  reviveChallenge,
} = require("./finalizeRecovery");
const {
  notifyPhpRecoveryPaid,
  retryPendingCallbacks,
} = require("./notifyPhp");
const { payRecoveryWithWallet } = require("./walletPay");
const {
  sendExpiryReminders,
  build5hMessage,
  build30mMessage,
  REMINDER_STAGES,
} = require("./reminders");

module.exports = {
  ...constants,
  helpers,
  pricing,

  // محاسبه‌ی قیمت (مخصوصاً سفارش‌های دستی با مبلغ صفر)
  PRICE_SOURCE: pricing.PRICE_SOURCE,
  PAID_SOURCE: pricing.PAID_SOURCE,
  resolveChallengePricing: pricing.resolveChallengePricing,
  buildFallbackPlanMatcher: pricing.buildFallbackPlanMatcher,
  needsFallbackPlan: pricing.needsFallbackPlan,
  calcInsuranceFeeUsd: pricing.calcInsuranceFeeUsd,
  calcFloatingRiskFeeUsd: pricing.calcFloatingRiskFeeUsd,

  // API ۱ — استعلام دسته‌ای برای تیم فروش
  lookupRecoveryAccounts,
  INELIGIBLE,

  // API ۲ — ثبت/جایگزینی فاکتور
  createRecoveryOffer,
  createRecoveryOrder,
  cancelOpenOffers,

  // مدیریت فاکتور
  getRecoveryOffer,
  cancelRecoveryOffer,
  listUserRecoveries,
  getPayableRecoveryOrder,
  serializeRecovery,
  getOpenRecoveryMap,
  attachRecoveryToChallenges,

  // پنل ادمین
  getRecoveryAdminMap,
  attachRecoveryToAdminChallenges,
  listChallengeRecoveries,

  // پرداخت و احیا
  finalizeRecoveryAfterPaid,
  reviveChallenge,
  payRecoveryWithWallet,

  // یادآور پیامکی پایان مهلت
  sendExpiryReminders,
  build5hMessage,
  build30mMessage,
  REMINDER_STAGES,

  // API ۳ — اطلاع‌رسانی به PHP
  notifyPhpRecoveryPaid,
  retryPendingCallbacks,
};
