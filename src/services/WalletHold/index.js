const { Op } = require("sequelize");
const sequelize = require("../../../db");
const Wallet = require("../../models/Wallet");
const WalletTransaction = require("../../models/WalletTransaction");
const WalletHold = require("../../models/WalletHold");

/**
 * رزرو/کسر موجودی ولت برای سرویس پارتنر + برگشت خودکار بعد از انقضا.
 *
 * دو حالت:
 *  - بدون `holdMinutes` → کسر قطعی (همان رفتار قبلی decrementWallet)
 *  - با `holdMinutes`   → کسر + ردیف رزرو با `expires_at`؛ اگر settle نشود،
 *    کرون پول را به ولت کاربر برمی‌گرداند.
 *
 * کل کار داخل یک transaction با `lock: UPDATE` روی ولت انجام می‌شود تا دو
 * درخواست همزمان موجودی را منفی نکنند.
 */

const REASON_LABELS = {
  competition: "کاهش موجودی بابت شرکت در مسابقه",
  challenge: "کاهش موجودی بابت چالش",
};

function labelFor(reason) {
  return REASON_LABELS[reason] || `کاهش موجودی توسط سرویس پارتنر (${reason})`;
}

function badRequest(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function holdToJson(hold) {
  return {
    hold_id: hold.id,
    status: hold.status,
    amount: Number(hold.amount),
    reason: hold.reason,
    reference_id: hold.reference_id,
    expires_at: hold.expires_at,
    settled_at: hold.settled_at,
    released_at: hold.released_at,
    transaction_id: hold.debit_transaction_id,
    refund_transaction_id: hold.refund_transaction_id,
  };
}

/** رزرو را با hold_id یا reference_id پیدا می‌کند */
async function findHold({ holdId, referenceId }, options = {}) {
  if (holdId) return WalletHold.findByPk(holdId, options);

  if (referenceId)
    return WalletHold.findOne({
      where: { reference_id: String(referenceId) },
      ...options,
    });

  throw badRequest("hold_id یا reference_id الزامی است");
}

/**
 * کسر موجودی؛ با holdMinutes به صورت رزرو موقت.
 */
async function decrementWallet({
  userId,
  amount,
  reason = "competition",
  description,
  referenceId = null,
  holdMinutes = null,
  partner = null,
}) {
  if (!Number.isInteger(userId) || userId <= 0)
    throw badRequest("user_id نامعتبر است");

  if (!Number.isFinite(amount) || amount <= 0)
    throw badRequest("amount نامعتبر است");

  if (holdMinutes !== null) {
    if (!Number.isFinite(holdMinutes) || holdMinutes <= 0)
      throw badRequest("hold_minutes نامعتبر است");

    // سقف ۳۰ روز؛ بالاتر از این یعنی اشتباه سمت فرستنده
    if (holdMinutes > 43200)
      throw badRequest("hold_minutes نمی‌تواند بیشتر از ۳۰ روز باشد");
  }

  const text = description || labelFor(reason);

  return sequelize.transaction(async (t) => {
    // تکرار درخواست با همان reference_id نباید دوباره پول کم کند
    if (referenceId) {
      const existingHold = await WalletHold.findOne({
        where: { reference_id: String(referenceId) },
        transaction: t,
      });

      if (existingHold) return { ...holdToJson(existingHold), duplicate: true };

      const existingTx = await WalletTransaction.findOne({
        where: { reference_id: String(referenceId) },
        transaction: t,
      });

      if (existingTx)
        return {
          transaction_id: existingTx.id,
          hold_id: null,
          status: "settled",
          balance: Number(existingTx.balance_after),
          duplicate: true,
        };
    }

    const wallet = await Wallet.findOne({
      where: { user_id: userId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!wallet) throw badRequest("ولت کاربر پیدا نشد", 404);

    const balanceBefore = Number(wallet.balance || 0);

    if (balanceBefore < amount) throw badRequest("موجودی ولت کافی نیست");

    const balanceAfter = balanceBefore - amount;

    await wallet.update({ balance: balanceAfter }, { transaction: t });

    const expiresAt = holdMinutes
      ? new Date(Date.now() + holdMinutes * 60 * 1000)
      : null;

    const tx = await WalletTransaction.create(
      {
        type: "adjustment",
        status: "completed",
        amount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        wallet_id: wallet.id,
        actor_type: "system",
        reference_id: referenceId,
        description: expiresAt
          ? `${text} (رزرو تا ${expiresAt.toISOString()})`
          : text,
        meta: {
          via: "partner_api",
          partner,
          reason,
          direction: "decrement",
          user_id: userId,
          hold: Boolean(expiresAt),
          expires_at: expiresAt,
        },
      },
      { transaction: t },
    );

    if (!expiresAt)
      return {
        transaction_id: tx.id,
        hold_id: null,
        status: "settled",
        balance: balanceAfter,
      };

    const hold = await WalletHold.create(
      {
        amount,
        status: "held",
        reason,
        description: text,
        reference_id: referenceId,
        expires_at: expiresAt,
        debit_transaction_id: tx.id,
        partner,
        user_id: userId,
        wallet_id: wallet.id,
      },
      { transaction: t },
    );

    return { ...holdToJson(hold), balance: balanceAfter };
  });
}

/**
 * تایید نهایی رزرو؛ بعد از این پول دیگر برنمی‌گردد.
 */
async function settleWalletHold({ holdId, referenceId }) {
  return sequelize.transaction(async (t) => {
    const hold = await findHold(
      { holdId, referenceId },
      { transaction: t, lock: t.LOCK.UPDATE },
    );

    if (!hold) throw badRequest("رزرو پیدا نشد", 404);

    // settle تکراری خطا نیست؛ همان نتیجه برمی‌گردد
    if (hold.status === "settled")
      return { ...holdToJson(hold), duplicate: true };

    if (hold.status !== "held")
      throw badRequest(`این رزرو قبلاً برگشت خورده است (${hold.status})`, 409);

    await hold.update(
      { status: "settled", settled_at: new Date() },
      { transaction: t },
    );

    return holdToJson(hold);
  });
}

/**
 * برگشت وجه رزرو به ولت کاربر.
 *
 * @param {"manual"|"expired"} cause لغو دستی پارتنر یا انقضای مهلت
 */
async function refundWalletHold({ holdId, referenceId, cause = "manual" }) {
  return sequelize.transaction(async (t) => {
    const hold = await findHold(
      { holdId, referenceId },
      { transaction: t, lock: t.LOCK.UPDATE },
    );

    if (!hold) throw badRequest("رزرو پیدا نشد", 404);

    if (hold.status === "refunded" || hold.status === "expired")
      return { ...holdToJson(hold), duplicate: true };

    if (hold.status !== "held")
      throw badRequest("این رزرو تایید نهایی شده و قابل برگشت نیست", 409);

    const wallet = await Wallet.findOne({
      where: { id: hold.wallet_id },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!wallet) throw badRequest("ولت کاربر پیدا نشد", 404);

    const amount = Number(hold.amount);
    const balanceBefore = Number(wallet.balance || 0);
    const balanceAfter = balanceBefore + amount;

    await wallet.update({ balance: balanceAfter }, { transaction: t });

    const text =
      cause === "expired"
        ? `برگشت وجه؛ مهلت «${hold.description || labelFor(hold.reason)}» تمام شد`
        : `برگشت وجه؛ «${hold.description || labelFor(hold.reason)}» لغو شد`;

    const tx = await WalletTransaction.create(
      {
        type: "adjustment",
        status: "completed",
        amount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        wallet_id: wallet.id,
        actor_type: "system",
        reference_id: hold.reference_id ? `refund-${hold.reference_id}` : null,
        description: text,
        meta: {
          via: "partner_api",
          partner: hold.partner,
          reason: hold.reason,
          direction: "increment",
          user_id: hold.user_id,
          refund_of_hold_id: hold.id,
          refund_of_transaction_id: hold.debit_transaction_id,
          cause,
        },
      },
      { transaction: t },
    );

    await hold.update(
      {
        status: cause === "expired" ? "expired" : "refunded",
        released_at: new Date(),
        refund_transaction_id: tx.id,
      },
      { transaction: t },
    );

    return { ...holdToJson(hold), balance: balanceAfter };
  });
}

/**
 * رزروهایی که مهلتشان تمام شده را برمی‌گرداند. کرون این را صدا می‌زند.
 *
 * هر رزرو در transaction خودش برگشت می‌خورد تا خطای یکی بقیه را خراب نکند.
 */
async function expireDueWalletHolds({ limit = 200 } = {}) {
  const due = await WalletHold.findAll({
    where: { status: "held", expires_at: { [Op.lte]: new Date() } },
    order: [["expires_at", "ASC"]],
    limit,
    attributes: ["id"],
  });

  const result = { scanned: due.length, refunded: 0, failed: 0 };

  for (const row of due) {
    try {
      await refundWalletHold({ holdId: row.id, cause: "expired" });
      result.refunded += 1;
    } catch (err) {
      result.failed += 1;
      console.error(
        `[wallet-hold] refund failed for hold ${row.id}:`,
        err?.message,
      );
    }
  }

  return result;
}

module.exports = {
  decrementWallet,
  settleWalletHold,
  refundWalletHold,
  expireDueWalletHolds,
  findHold,
  holdToJson,
};
