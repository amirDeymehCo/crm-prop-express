const Wallet = require("../../models/Wallet");
const WalletTransaction = require("../../models/WalletTransaction");
const Payment = require("../../models/Payment");
const Order = require("../../models/Order");

async function payWithWallet({ userId, orderId, amountUsd, t }) {
  // 1) lock wallet
  const wallet = await Wallet.findOne({
    where: { user_id: userId },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });
  if (!wallet)
    throw Object.assign(new Error("ولت کاربر یافت نشد"), { status: 400 });

  const balance = Number(wallet.balance || 0);
  if (balance < Number(amountUsd)) {
    throw Object.assign(new Error("موجودی ولت کافی نیست"), { status: 400 });
  }

  // 2) کم کردن موجودی
  await wallet.update(
    { balance: balance - Number(amountUsd) },
    { transaction: t },
  );

  // 3) ثبت تراکنش ولت (Ledger)
  await WalletTransaction.create(
    {
      user_id: userId,
      type: "buy_ch",
      amount: Number(amountUsd),
      balance_before: wallet?.balance,
      balance_after: Number(wallet?.balance) + Number(amountUsd),
      meta: { via: "wallet", order_id: orderId },
    },
    { transaction: t },
  );

  // 4) آپدیت Payment/Order به حالت پرداخت با ولت (اختیاری ولی بهتره)
  await Payment.update(
    { provider: "wallet", status: "waiting" },
    { where: { order_id: orderId }, transaction: t },
  );

  await Order.update(
    { gateway: "wallet" },
    { where: { gateway_order_id: orderId }, transaction: t },
  );

  return true;
}

module.exports = { payWithWallet };
