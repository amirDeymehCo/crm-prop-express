const sequelize = require("../../../db");
const Order = require("../../models/Order");
const HistoryChallenge = require("../../models/Challenge/HistoryChallenge");
const ChallengeRecovery = require("../../models/ChallengeRecovery");
const UserChallenge = require("../../models/Challenge/UserChallenge");
const ChallengePlan = require("../../models/Challenge/ChallengePlan");

const { RECOVERY_STATUS, RECOVERY_ORDER_TYPE } = require("./constants");
const { round2, parseJsonField } = require("./helpers");
const { createRecoveryOrder } = require("./createOffer");

const OPEN_STATUSES = [
  RECOVERY_STATUS.PENDING_PAYMENT,
  RECOVERY_STATUS.PARTIALLY_PAID,
];

function serializeRecovery(recovery, { orders = [] } = {}) {
  return {
    recovery_id: recovery.id,
    user_id: recovery.user_id,
    user_challenge_id: recovery.user_challenge_id,
    account_instance_id: recovery.account_instance_id,
    mt_login: recovery.mt_login,
    phase_index: recovery.phase_index,

    status: recovery.status,
    payment_plan: recovery.payment_plan,

    previous_price_usd:
      recovery.previous_price_usd == null
        ? null
        : round2(recovery.previous_price_usd),
    offer_price_usd: round2(recovery.offer_price_usd),
    offer_price_irr: Number(recovery.offer_price_irr || 0),
    first_amount_usd: round2(recovery.first_amount_usd),
    second_amount_usd:
      recovery.second_amount_usd == null
        ? null
        : round2(recovery.second_amount_usd),
    paid_amount_usd: round2(recovery.paid_amount_usd),
    remaining_amount_usd: round2(
      Math.max(
        Number(recovery.offer_price_usd || 0) -
          Number(recovery.paid_amount_usd || 0),
        0,
      ),
    ),

    external_ref: recovery.external_ref,
    agent_label: recovery.agent_label,
    note: recovery.note,
    expires_at: recovery.expires_at,

    first_paid_at: recovery.first_paid_at,
    second_paid_at: recovery.second_paid_at,
    paid_at: recovery.paid_at,
    revived_at: recovery.revived_at,
    cancelled_at: recovery.cancelled_at,

    callback_status: recovery.callback_status,
    callback_attempts: recovery.callback_attempts,
    callback_last_error: recovery.callback_last_error,
    callback_sent_at: recovery.callback_sent_at,

    created_at: recovery.createdAt,

    orders: orders.map((o) => ({
      id: o.id,
      gateway_order_id: o.gateway_order_id,
      installment_number: o.installment_number,
      amount_usd: round2(o.final_amount_usd),
      amount_irr: Number(o.final_amount_irr || 0),
      status: o.status,
      gateway: o.gateway,
      paid_at: o.paid_at,
    })),
  };
}

async function findRecovery({ id, external_ref, transaction, lock = false }) {
  const where = id ? { id } : { external_ref };

  return ChallengeRecovery.findOne({
    where,
    order: [["id", "DESC"]],
    transaction,
    ...(lock && transaction ? { lock: transaction.LOCK.UPDATE } : {}),
  });
}

/**
 * وضعیت یک پیشنهاد — برای وقتی که پنل PHP می‌خواهد بداند پرداخت شده یا نه.
 */
async function getRecoveryOffer({ id, external_ref }) {
  const recovery = await findRecovery({ id, external_ref });

  if (!recovery) {
    throw Object.assign(new Error("فاکتور بازیابی پیدا نشد"), {
      status: 404,
      code: "recovery_not_found",
    });
  }

  const orders = await Order.findAll({
    where: {
      order_group_id: recovery.order_group_id,
      type: RECOVERY_ORDER_TYPE,
    },
    order: [["installment_number", "ASC"], ["id", "ASC"]],
  });

  return serializeRecovery(recovery, { orders });
}

/**
 * باطل کردن یک پیشنهاد پرداخت‌نشده.
 *
 * پیشنهاد نیمه‌پرداخت یا پرداخت‌شده قابل ابطال نیست — پول گرفته شده و حساب
 * احیا شده است؛ برگرداندنش کار دستیِ مالی است نه یک API.
 */
async function cancelRecoveryOffer({ id, external_ref, reason = null }) {
  const t = await sequelize.transaction();

  try {
    const recovery = await findRecovery({
      id,
      external_ref,
      transaction: t,
      lock: true,
    });

    if (!recovery) {
      throw Object.assign(new Error("فاکتور بازیابی پیدا نشد"), {
        status: 404,
        code: "recovery_not_found",
      });
    }

    if (recovery.status === RECOVERY_STATUS.CANCELLED) {
      await t.commit();
      return serializeRecovery(recovery);
    }

    if (recovery.status !== RECOVERY_STATUS.PENDING_PAYMENT) {
      throw Object.assign(
        new Error("فاکتوری که پرداختی روی آن انجام شده قابل ابطال نیست"),
        { status: 409, code: "recovery_not_cancellable" },
      );
    }

    await recovery.update(
      {
        status: RECOVERY_STATUS.CANCELLED,
        cancelled_at: new Date(),
        meta: {
          ...(parseJsonField(recovery.meta) || {}),
          cancel_reason: reason || "php_request",
        },
      },
      { transaction: t },
    );

    await Order.update(
      { status: "cancelled" },
      {
        where: {
          order_group_id: recovery.order_group_id,
          type: RECOVERY_ORDER_TYPE,
          status: "pending",
        },
        transaction: t,
      },
    );

    await HistoryChallenge.create(
      {
        user_challenge_id: recovery.user_challenge_id,
        type: "recovery_offer_cancelled",
        title:
          `فاکتور بازیابی حساب ${recovery.mt_login} باطل شد` +
          (reason ? ` — ${reason}` : ""),
      },
      { transaction: t },
    );

    await t.commit();

    return serializeRecovery(recovery);
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
}

/**
 * پیشنهادهای بازِ یک کاربر — همان چیزی که دکمه‌ی «بازیابی حساب» در پنل کاربر
 * از آن تغذیه می‌شود.
 */
async function listUserRecoveries(userId) {
  const recoveries = await ChallengeRecovery.findAll({
    where: { user_id: userId, status: OPEN_STATUSES },
    order: [["id", "DESC"]],
    include: [
      {
        model: UserChallenge,
        attributes: ["id", "status", "platform", "challenge_plan_id"],
        include: [
          { model: ChallengePlan, attributes: ["id", "title", "balance"] },
        ],
      },
    ],
  });

  if (!recoveries.length) return [];

  const orders = await Order.findAll({
    where: {
      order_group_id: recoveries.map((r) => r.order_group_id),
      type: RECOVERY_ORDER_TYPE,
    },
    order: [["installment_number", "ASC"], ["id", "ASC"]],
  });

  const ordersByGroup = new Map();

  for (const order of orders) {
    const list = ordersByGroup.get(order.order_group_id) || [];
    list.push(order);
    ordersByGroup.set(order.order_group_id, list);
  }

  return recoveries.map((recovery) => {
    const own = ordersByGroup.get(recovery.order_group_id) || [];
    const payable = own.find((o) => o.status === "pending") || null;

    return {
      ...serializeRecovery(recovery, { orders: own }),
      plan_title: recovery.UserChallenge?.ChallengePlan?.title ?? null,
      plan_balance_usd:
        recovery.UserChallenge?.ChallengePlan?.balance != null
          ? Number(recovery.UserChallenge.ChallengePlan.balance)
          : null,
      payable_order: payable
        ? {
            id: payable.id,
            installment_number: payable.installment_number,
            amount_usd: round2(payable.final_amount_usd),
            amount_irr: Number(payable.final_amount_irr || 0),
          }
        : null,
    };
  });
}

/**
 * سفارشِ قابل پرداختِ فعلیِ یک بازیابی.
 *
 * اگر به هر دلیلی سفارش قسط جاری ساخته نشده باشد (مثلاً رکورد قدیمی)، همین‌جا
 * ساخته می‌شود تا کاربر پشت در نماند.
 */
async function getPayableRecoveryOrder({ recovery, transaction }) {
  const existing = await Order.findOne({
    where: {
      order_group_id: recovery.order_group_id,
      type: RECOVERY_ORDER_TYPE,
      status: "pending",
    },
    order: [["installment_number", "ASC"], ["id", "ASC"]],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (existing) return existing;

  const isSecond = recovery.status === RECOVERY_STATUS.PARTIALLY_PAID;

  const amountUsd = isSecond
    ? round2(recovery.second_amount_usd || 0)
    : round2(recovery.first_amount_usd || 0);

  const amountIrr = isSecond
    ? Math.round(Number(recovery.second_amount_irr || 0))
    : Math.round(Number(recovery.first_amount_irr || 0));

  if (!(amountUsd > 0)) {
    throw Object.assign(new Error("فاکتور قابل پرداختی برای این بازیابی نیست"), {
      status: 400,
    });
  }

  return createRecoveryOrder({
    recovery,
    installmentNumber: isSecond ? 2 : 1,
    amountUsd,
    amountIrr,
    gateway: "peykan",
    transaction,
  });
}

/**
 * فاکتور بازِ هر چالش به شکل فشرده، برای چسباندن به لیست چالش‌های کاربر.
 *
 * خروجی عمداً کوچک است؛ فقط اندازه‌ی چیزی که برای نشان دادن دکمه‌ی
 * «بازیابی حساب» و مبلغش لازم است.
 */
async function getOpenRecoveryMap(challengeIds) {
  const ids = [...new Set((challengeIds || []).filter(Boolean))];

  if (!ids.length) return new Map();

  const recoveries = await ChallengeRecovery.findAll({
    where: { user_challenge_id: ids, status: OPEN_STATUSES },
    order: [["id", "DESC"]],
  });

  if (!recoveries.length) return new Map();

  const orders = await Order.findAll({
    where: {
      order_group_id: recoveries.map((r) => r.order_group_id),
      type: RECOVERY_ORDER_TYPE,
      status: "pending",
    },
    order: [
      ["installment_number", "ASC"],
      ["id", "ASC"],
    ],
  });

  const payableByGroup = new Map();

  for (const order of orders) {
    if (!payableByGroup.has(order.order_group_id)) {
      payableByGroup.set(order.order_group_id, order);
    }
  }

  const map = new Map();

  for (const recovery of recoveries) {
    // اگر چند رکورد باز بود، جدیدترین ملاک است (مرتب شده id DESC)
    if (map.has(recovery.user_challenge_id)) continue;

    const payable = payableByGroup.get(recovery.order_group_id) || null;

    map.set(recovery.user_challenge_id, {
      recovery_id: recovery.id,
      status: recovery.status,
      mt_login: recovery.mt_login,
      phase_index: recovery.phase_index,
      payment_plan: recovery.payment_plan,
      offer_price_usd: round2(recovery.offer_price_usd),
      paid_amount_usd: round2(recovery.paid_amount_usd),
      remaining_amount_usd: round2(
        Math.max(
          Number(recovery.offer_price_usd || 0) -
            Number(recovery.paid_amount_usd || 0),
          0,
        ),
      ),
      expires_at: recovery.expires_at,
      payable_order: payable
        ? {
            id: payable.id,
            installment_number: payable.installment_number,
            amount_usd: round2(payable.final_amount_usd),
            amount_irr: Number(payable.final_amount_irr || 0),
          }
        : null,
    });
  }

  return map;
}

/**
 * فیلد recovery را به رکوردهای لیست چالش اضافه می‌کند (برای چالش‌های
 * بدون فاکتور، null). خروجی آرایه‌ی آبجکت ساده است.
 */
async function attachRecoveryToChallenges(items) {
  const list = Array.isArray(items) ? items : [];

  if (!list.length) return list;

  const map = await getOpenRecoveryMap(list.map((i) => i.id));

  return list.map((item) => {
    const plain = typeof item?.toJSON === "function" ? item.toJSON() : { ...item };

    plain.recovery = map.get(plain.id) ?? null;

    return plain;
  });
}

/**
 * خلاصه‌ی بازیابی برای **لیست پنل ادمین**.
 *
 * برعکس getOpenRecoveryMap که فقط فاکتور باز را می‌دهد، اینجا ادمین باید کل
 * تصویر را ببیند: فاکتور باز + شمارش تاریخچه. ولی نه کامل — این روی لیست
 * صفحه‌بندی‌شده صدا زده می‌شود، پس فقط اعداد و آخرین وضعیت برمی‌گردد.
 *
 * برای صفحه‌ی جزئیات از listChallengeRecoveries استفاده کن.
 */
async function getRecoveryAdminMap(challengeIds) {
  const ids = [...new Set((challengeIds || []).filter(Boolean))];

  if (!ids.length) return new Map();

  const recoveries = await ChallengeRecovery.findAll({
    where: { user_challenge_id: ids },
    order: [["id", "DESC"]],
  });

  if (!recoveries.length) return new Map();

  const openGroups = recoveries
    .filter((r) => OPEN_STATUSES.includes(r.status))
    .map((r) => r.order_group_id)
    .filter(Boolean);

  const payableOrders = openGroups.length
    ? await Order.findAll({
        where: {
          order_group_id: openGroups,
          type: RECOVERY_ORDER_TYPE,
          status: "pending",
        },
        order: [
          ["installment_number", "ASC"],
          ["id", "ASC"],
        ],
      })
    : [];

  const payableByGroup = new Map();

  for (const order of payableOrders) {
    if (!payableByGroup.has(order.order_group_id)) {
      payableByGroup.set(order.order_group_id, order);
    }
  }

  const map = new Map();

  for (const recovery of recoveries) {
    const key = recovery.user_challenge_id;

    if (!map.has(key)) {
      map.set(key, {
        open: null,
        counts: { total: 0, open: 0, paid: 0, cancelled: 0, expired: 0 },
        last_paid_at: null,
        // اگر اطلاع‌رسانی به PHP گیر کرده، ادمین باید ببیند
        pending_php_callback: false,
      });
    }

    const entry = map.get(key);

    entry.counts.total += 1;

    if (recovery.status === RECOVERY_STATUS.PAID) entry.counts.paid += 1;
    else if (recovery.status === RECOVERY_STATUS.CANCELLED) entry.counts.cancelled += 1;
    else if (recovery.status === RECOVERY_STATUS.EXPIRED) entry.counts.expired += 1;

    if (OPEN_STATUSES.includes(recovery.status)) {
      entry.counts.open += 1;

      // رکوردها id DESC مرتب‌اند، پس اولین بازی که دیده شود جدیدترین است
      if (!entry.open) {
        const payable = payableByGroup.get(recovery.order_group_id) || null;

        entry.open = {
          recovery_id: recovery.id,
          status: recovery.status,
          mt_login: recovery.mt_login,
          phase_index: recovery.phase_index,
          payment_plan: recovery.payment_plan,
          previous_price_usd:
            recovery.previous_price_usd == null
              ? null
              : round2(recovery.previous_price_usd),
          offer_price_usd: round2(recovery.offer_price_usd),
          paid_amount_usd: round2(recovery.paid_amount_usd),
          remaining_amount_usd: round2(
            Math.max(
              Number(recovery.offer_price_usd || 0) -
                Number(recovery.paid_amount_usd || 0),
              0,
            ),
          ),
          agent_label: recovery.agent_label,
          external_ref: recovery.external_ref,
          expires_at: recovery.expires_at,
          created_at: recovery.createdAt,
          payable_order: payable
            ? {
                id: payable.id,
                installment_number: payable.installment_number,
                amount_usd: round2(payable.final_amount_usd),
                amount_irr: Number(payable.final_amount_irr || 0),
              }
            : null,
        };
      }
    }

    if (recovery.paid_at && !entry.last_paid_at) {
      entry.last_paid_at = recovery.paid_at;
    }

    if (
      recovery.revived_at &&
      (recovery.callback_status === "pending" ||
        recovery.callback_status === "failed")
    ) {
      entry.pending_php_callback = true;
    }
  }

  return map;
}

/**
 * فیلد recovery را به ردیف‌های لیست پنل ادمین می‌چسباند.
 */
async function attachRecoveryToAdminChallenges(items) {
  const list = Array.isArray(items) ? items : [];

  if (!list.length) return list;

  const map = await getRecoveryAdminMap(list.map((i) => i.id));

  return list.map((item) => {
    const plain =
      typeof item?.toJSON === "function" ? item.toJSON() : { ...item };

    plain.recovery = map.get(plain.id) ?? null;

    return plain;
  });
}

/**
 * تاریخچه‌ی کامل بازیابی‌های یک چالش — برای صفحه‌ی جزئیات پنل ادمین.
 *
 * همه‌ی وضعیت‌ها را برمی‌گرداند (باطل‌شده و منقضی هم)، چون ادمین باید بتواند
 * مذاکره‌ی قیمت را دنبال کند: مثلاً ۱۰ دلار بود، شد ۷، بعد ۵.
 */
async function listChallengeRecoveries(challengeId) {
  const recoveries = await ChallengeRecovery.findAll({
    where: { user_challenge_id: challengeId },
    order: [["id", "DESC"]],
  });

  if (!recoveries.length) return [];

  const orders = await Order.findAll({
    where: {
      order_group_id: recoveries.map((r) => r.order_group_id).filter(Boolean),
      type: RECOVERY_ORDER_TYPE,
    },
    order: [
      ["installment_number", "ASC"],
      ["id", "ASC"],
    ],
  });

  const ordersByGroup = new Map();

  for (const order of orders) {
    const list = ordersByGroup.get(order.order_group_id) || [];
    list.push(order);
    ordersByGroup.set(order.order_group_id, list);
  }

  return recoveries.map((recovery) =>
    serializeRecovery(recovery, {
      orders: ordersByGroup.get(recovery.order_group_id) || [],
    }),
  );
}

module.exports = {
  OPEN_STATUSES,
  getOpenRecoveryMap,
  attachRecoveryToChallenges,
  getRecoveryAdminMap,
  attachRecoveryToAdminChallenges,
  listChallengeRecoveries,
  serializeRecovery,
  getRecoveryOffer,
  cancelRecoveryOffer,
  listUserRecoveries,
  getPayableRecoveryOrder,
};
