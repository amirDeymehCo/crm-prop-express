const Wallet = require("../../models/Wallet");
const WalletTransaction = require("../../models/WalletTransaction");
const Payment = require("../../models/Payment");
const Order = require("../../models/Order");

async function payWithWallet({ userId, orderId, amountUsd, t, discountUsd }) {
  // 1) lock wallet
  const wallet = await Wallet.findOne({
    where: { user_id: userId },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });
  if (!wallet)
    throw Object.assign(new Error("ولت کاربر یافت نشد"), { status: 400 });

  const finalAmountUSD = Number(amountUsd) - Number(discountUsd || 0);

  const balance = Number(wallet.balance || 0);
  if (balance < Number(finalAmountUSD)) {
    throw Object.assign(new Error("موجودی ولت کافی نیست"), { status: 400 });
  }

  // 2) کم کردن موجودی
  await wallet.update(
    { balance: balance - Number(finalAmountUSD) },
    { transaction: t },
  );

  // 3) ثبت تراکنش ولت (Ledger)
  await WalletTransaction.create(
    {
      user_id: userId,
      type: "buy_ch",
      status: "completed",
      amount: Number(finalAmountUSD),
      balance_before: wallet?.balance,
      balance_after: Number(wallet?.balance) - Number(finalAmountUSD),
      meta: { via: "wallet", order_id: orderId },
    },
    { transaction: t },
  );

  // 4) آپدیت Payment/Order به حالت پرداخت با ولت (اختیاری ولی بهتره)
  await Payment.update(
    { provider: "wallet", status: "waiting" },
    { where: { order_id: orderId }, transaction: t },
  );

  const order = await Order.update(
    { gateway: "wallet", status: "paid", type: "challenge_purchase_wallet" },
    { where: { gateway_order_id: orderId }, transaction: t },
  );

  return true;
}

module.exports = { payWithWallet };
