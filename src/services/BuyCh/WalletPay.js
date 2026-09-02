const Wallet = require("../../models/Wallet");
const WalletTransaction = require("../../models/WalletTransaction");
const Payment = require("../../models/Payment");
const Order = require("../../models/Order");

/**
 * سفارش را پیدا می‌کند؛ چه gateway_order_id رشته‌ای پاس داده باشند چه id عددی.
 *
 * ⚠️ مهم: gateway_order_id از نوع VARCHAR است. اگر عدد را مستقیم با آن مقایسه
 * کنیم، MySQL ستون را به DOUBLE کست می‌کند و روی مقادیری مثل
 * 'buyCh-1-1784630761237' خطای «Truncated incorrect DOUBLE value» می‌دهد —
 * روی سرور که sql_mode سخت‌گیرانه است این خطا کوئری را می‌شکند.
 */
async function findOrderForPayment({ orderId, t }) {
  const isNumericId = /^\d+$/.test(String(orderId));

  const where = isNumericId
    ? { id: Number(orderId) }
    : { gateway_order_id: String(orderId) };

  return Order.findOne({
    where,
    transaction: t,
    lock: t.LOCK.UPDATE,
  });
}

async function payWithWallet({ userId, orderId, amountUsd, t, discountUsd }) {
  if (orderId === null || orderId === undefined || orderId === "") {
    throw Object.assign(new Error("شناسه سفارش برای پرداخت با ولت ارسال نشده"), {
      status: 400,
    });
  }

  // 0) سفارش را قبل از کم کردن پول پیدا کن
  const order = await findOrderForPayment({ orderId, t });

  if (!order) {
    throw Object.assign(new Error("سفارش برای پرداخت با ولت پیدا نشد"), {
      status: 400,
    });
  }

  // 1) lock wallet
  const wallet = await Wallet.findOne({
    where: { user_id: userId },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });
  if (!wallet)
    throw Object.assign(new Error("ولت کاربر یافت نشد"), { status: 400 });

  console.log("1----");

  const finalAmountUSD = Number(amountUsd) - Number(discountUsd || 0);

  const balance = Number(wallet.balance || 0);
  if (balance < Number(finalAmountUSD)) {
    throw Object.assign(new Error("موجودی ولت کافی نیست"), { status: 400 });
  }
  console.log("2----");

  // 2) کم کردن موجودی
  await wallet.update(
    { balance: balance - Number(finalAmountUSD) },
    { transaction: t },
  );
  console.log("3----");

  // 3) ثبت تراکنش ولت (Ledger)
  await WalletTransaction.create(
    {
      user_id: userId,
      type: "buy_ch",
      status: "completed",
      amount: Number(finalAmountUSD),
      balance_before: wallet?.balance,
      balance_after: Number(wallet?.balance) - Number(finalAmountUSD),
      meta: {
        via: "wallet",
        order_id: order.id,
        gateway_order_id: order.gateway_order_id,
      },
    },
    { transaction: t },
  );

  console.log("4----");
  console.log(orderId);

  // 4) آپدیت Order به حالت پرداخت با ولت
  await order.update(
    { gateway: "wallet", status: "paid", type: "challenge_purchase_wallet" },
    { transaction: t },
  );
  console.log("6----");

  return true;
}

module.exports = { payWithWallet };
