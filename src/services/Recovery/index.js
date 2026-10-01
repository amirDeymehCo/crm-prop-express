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

  // پرداخت و احیا
  finalizeRecoveryAfterPaid,
  reviveChallenge,
  payRecoveryWithWallet,

  // API ۳ — اطلاع‌رسانی به PHP
  notifyPhpRecoveryPaid,
  retryPendingCallbacks,
};
