const Wallet = require("../../models/Wallet");
const WalletTransaction = require("../../models/WalletTransaction");

const { round2, parseJsonField } = require("./helpers");

/**
 * پرداخت فاکتور بازیابی از کیف پول.
 *
 * عمداً از BuyCh/WalletPay استفاده نمی‌کنیم: آن تابع نوع سفارش را به
 * challenge_purchase_wallet تغییر می‌دهد و سفارشِ بازیابی را از دید گزارش‌ها و
 * از دید finalizeRecoveryAfterPaid خراب می‌کند. اینجا فقط موجودی کم می‌شود؛
 * paid کردن خود سفارش کار finalizeRecoveryAfterPaid است.
 */
async function payRecoveryWithWallet({ userId, order, transaction }) {
  const meta = parseJsonField(order.meta) || {};

  const amountUsd = round2(order.final_amount_usd ?? order.amount_usd ?? 0);

  if (!(amountUsd > 0)) {
    throw Object.assign(new Error("مبلغ فاکتور بازیابی معتبر نیست"), {
      status: 400,
    });
  }

  const wallet = await Wallet.findOne({
    where: { user_id: userId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (!wallet) {
    throw Object.assign(new Error("کیف پول کاربر یافت نشد"), { status: 400 });
  }

  const balanceBefore = Number(wallet.balance || 0);

  if (balanceBefore < amountUsd) {
    throw Object.assign(new Error("موجودی کیف پول کافی نیست"), { status: 400 });
  }

  const balanceAfter = round2(balanceBefore - amountUsd);

  await wallet.update({ balance: balanceAfter }, { transaction });

  await WalletTransaction.create(
    {
      user_id: userId,
      type: "buy_ch",
      status: "completed",
      amount: amountUsd,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      description: `بازیابی حساب ${meta.mt_login ?? ""}`.trim(),
      meta: {
        via: "wallet",
        kind: "challenge_recovery",
        order_id: order.id,
        gateway_order_id: order.gateway_order_id,
        recovery_id: meta.recovery_id ?? null,
      },
    },
    { transaction },
  );

  await order.update({ gateway: "wallet" }, { transaction });

  return { amountUsd, balanceAfter };
}

module.exports = { payRecoveryWithWallet };
