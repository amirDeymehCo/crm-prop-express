const { Op } = require("sequelize");
const Order = require("../../models/Order");
const Wallet = require("../../models/Wallet");
const WalletTransaction = require("../../models/WalletTransaction");
const Withdrawal = require("../../models/WidthdrawRequest");

/**
 * گرد کردن پول به ۲ رقم اعشار برای جلوگیری از خطای اعشاری
 */
const round2 = (n) => Math.round((Number(n) + Number.EPSILOT) * 100) / 100;

/**
 * پیدا کردن مبلغی که کاربر واقعاً پرداخت کرده.
 *
 * اولویت با Order هست، چون اونجا مبلغ نهایی بعد از کوپن/تخفیف ثبت میشه.
 * اگه Order پیدا نشد، از فیلدهای خود UserChallenge استفاده می‌کنیم.
 */
async function getPaidAmountUSD(userChallenge, transaction) {
  console.log({ user_challenge_id: userChallenge.id, status: "paid" });

  // ۱) بهترین حالت: آخرین سفارشِ پرداخت‌شده برای این چالش
  const paidOrder = await Order.findOne({
    where: {
      user_challenge_id: userChallenge.id,
      status: "paid",
    },
    order: [["id", "DESC"]],
    attributes: ["final_amount_usd", "amount_usd"],
    transaction,
  });

  if (paidOrder) {
    const paid = Number(
      paidOrder?.dataValues?.final_price_usd ??
        paidOrder?.dataValues?.final_amount_usd ??
        paidOrder?.dataValues?.amount_usd ??
        paidOrder?.dataValues?.price_usd,
    );
    return paid;
  }

  return 0;
}

/**
 * شارژ مستقیم ولت کاربر (بدون نیاز به گیتوی پرداخت)
 *
 * ⚠️ اگه مدل Wallet/WalletTransaction جداست از این استفاده کن؛
 * اگه ولتت رو با Order type=wallet_deposit نگه می‌داری، منطقش رو اینجا عوض کن.
 */
async function creditWalletUSD({
  userId,
  amountUsd,
  description,
  adminId = null,
  transaction,
}) {
  const amount = amountUsd;
  if (amount <= 0) return null;

  const wallet = await Wallet.findOne({
    where: { user_id: userId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  const balanceBefore = wallet ? Number(wallet.balance ?? 0) : 0;

  if (wallet) {
    await wallet.update({ balance: balanceBefore + amount }, { transaction });
  } else {
    await Wallet.create(
      {
        user_id: userId,
        balance: amount,
        currency: "USD",
      },
      { transaction },
    );
  }

  // تراکنش ولت برای گزارش‌گیری و ممیزی
  if (WalletTransaction) {
    await WalletTransaction.create(
      {
        wallet_id: wallet?.id ?? null,
        user_id: userId,
        type: "deposit",
        amount_usd: amount,
        amount: amount,
        balance_before: balanceBefore,
        balance_after: balanceBefore + amount,
        description,
        admin_id: adminId,
      },
      { transaction },
    );
  }

  return { balanceBefore, balanceAfter: balanceBefore + amount };
}

/**
 * آیا کاربر از این چالش برداشت (payout) موفق داشته؟
 */
function hasWithdrawalFromChallenge(userChallenge) {
  const fundedCycleCount = Number(userChallenge?.funded_cycle_count ?? 0);
  return fundedCycleCount > 0;
}

module.exports = {
  round2,
  getPaidAmountUSD,
  creditWalletUSD,
  hasWithdrawalFromChallenge,
};
