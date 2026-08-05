const fs = require("fs");
const path = require("path");
const sequelize = require("../db");

const User = require("../src/models/User");
const Ticket = require("../src/models/Ticket");
const Message = require("../src/models/Message");

// تنظیمات تست و مهاجرت
const LIMIT = 20; // تعداد تیکت‌هایی که می‌خواهید مهاجرت دهید (برای تست)

const departmentMap = {
  1: "request_widthdraw",
  2: "technical",
  3: "liveAccount",
  4: "challenges",
  7: "technical",
  8: "liveAccount",
  9: "challenges",
  10: "request_widthdraw",
  11: "real_account",
  12: "technical",
  13: "technical",
};

const statusMap = {
  open: "ticket_open",
  closed: "ticket_closed",
  answered: "ticket_answered",
  pending: "ticket_in_review",
  review: "ticket_in_review",
};

const priorityMap = {
  low: "low",
  medium: "medium",
  high: "hight",
};

function parseDate(value) {
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function normalizeStatus(status) {
  if (!status) return "ticket_open";
  return statusMap[String(status).toLowerCase()] || "ticket_open";
}

function normalizePriority(priority) {
  if (!priority) return "medium";
  return priorityMap[String(priority).toLowerCase()] || "medium";
}

function normalizeDepartment(departmentId) {
  return departmentMap[Number(departmentId)] || "technical";
}

function loadExportFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function extractTableData(exportJson, tableName) {
  const table = exportJson.find(
    (item) => item.type === "table" && item.name === tableName,
  );

  if (!table || !Array.isArray(table.data)) {
    throw new Error(`جدول دیتا یافت نشد: ${tableName}`);
  }

  return table.data;
}

// پیدا کردن شناسه کاربر قدیمی
function getOldCustomerId(oldTicket) {
  if (oldTicket.user_id) return Number(oldTicket.user_id);
  if (Number(oldTicket.from_admin) !== 1 && oldTicket.creator_id) {
    return Number(oldTicket.creator_id);
  }
  return null;
}

async function buildUserMap() {
  const users = await User.findAll({
    attributes: ["id", "legacy_user_id"],
    raw: true,
  });

  const map = new Map();
  for (const user of users) {
    if (user.legacy_user_id != null) {
      map.set(Number(user.legacy_user_id), Number(user.id));
    }
  }
  return map;
}

async function migrate() {
  const ticketsFilePath = path.join(
    __dirname,
    "./3FvQc1oszX_wpast_tickets.json",
  );

  const repliesFilePath = path.join(
    __dirname,
    "./3FvQc1oszX_wpast_replies.json",
  );

  const ticketsExportJson = loadExportFile(ticketsFilePath);
  const repliesExportJson = loadExportFile(repliesFilePath);

  const allOldTickets = extractTableData(
    ticketsExportJson,
    "3FvQc1oszX_wpast_tickets",
  );

  const allOldReplies = extractTableData(
    repliesExportJson,
    "3FvQc1oszX_wpast_replies",
  );

  // اعمال لیمیت برای فاز تست
  const oldTickets = allOldTickets.slice(0, LIMIT);

  // فیلتر کردن پاسخ‌ها بر اساس تیکت‌های لیمیت شده
  const allowedOldTicketIds = new Set(oldTickets.map((t) => Number(t.ID)));
  const oldReplies = allOldReplies.filter((reply) =>
    allowedOldTicketIds.has(Number(reply.ticket_id)),
  );

  console.log(`🚀 شروع مهاجرت تستی با لیمیت ${LIMIT} تیکت...`);
  console.log(`تعداد پاسخ‌های مرتبط برای پردازش: ${oldReplies.length}`);

  const userMap = await buildUserMap();
  const ticketIdMap = new Map();
  const unresolvedUsers = [];

  const transaction = await sequelize.transaction();

  try {
    // ۱. ایجاد تیکت‌ها و پیام‌های اولیه آن‌ها
    for (const oldTicket of oldTickets) {
      const oldCustomerId = getOldCustomerId(oldTicket);
      const newUserId = oldCustomerId ? userMap.get(oldCustomerId) : null;

      // اگر کاربر مربوط به تیکت در دیتابیس جدید یافت نشد
      if (!newUserId) {
        unresolvedUsers.push({
          oldTicketId: oldTicket.ID,
          oldCustomerId,
          title: oldTicket.title,
        });
        continue; // رد کردن تیکت بدون کاربر معتبر جهت جلوگیری از خطا در کلید خارجی
      }

      const newTicket = await Ticket.create(
        {
          user_id: newUserId,
          type: "ticket",
          title: oldTicket.title?.trim() || "بدون عنوان",
          files: null,
          departeman: normalizeDepartment(oldTicket.department_id),
          priority: normalizePriority(oldTicket.priority),
          status: normalizeStatus(oldTicket.status),
          closed_at:
            normalizeStatus(oldTicket.status) === "ticket_closed"
              ? parseDate(oldTicket.reply_date || oldTicket.create_date)
              : null,
          createdByAdmin: Number(oldTicket.from_admin) === 1,
          createdAt: parseDate(oldTicket.create_date),
          updatedAt: parseDate(oldTicket.reply_date || oldTicket.create_date),
        },
        { transaction },
      );

      // مپ کردن آی‌دی تیکت قدیمی به جدید برای پاسخ‌ها
      ticketIdMap.set(Number(oldTicket.ID), newTicket.id);

      // پیام اولیه تیکت (content)
      if (oldTicket.content && oldTicket.content.trim()) {
        const isCreatedByAdmin = Number(oldTicket.from_admin) === 1;

        await Message.create(
          {
            ticket_id: newTicket.id,
            text: oldTicket.content.trim(),
            senderType: isCreatedByAdmin ? "admin" : "user",
            files: [],
            createdAt: parseDate(oldTicket.create_date),
            updatedAt: parseDate(oldTicket.create_date),
          },
          { transaction },
        );
      }
    }

    // ۲. پردازش پاسخ‌های تیکت (Replies)
    for (const oldReply of oldReplies) {
      const mappedTicketId = ticketIdMap.get(Number(oldReply.ticket_id));
      if (!mappedTicketId) continue;
      if (!oldReply.content || !oldReply.content.trim()) continue;

      // تعیین دقیق فرستنده بر اساس وجود یا عدم وجود creator_id در نقشه کاربران جدید
      const replyCreatorId = oldReply.creator_id
        ? Number(oldReply.creator_id)
        : null;
      const isUserSender = replyCreatorId ? userMap.has(replyCreatorId) : false;
      const senderType = isUserSender ? "user" : "admin";

      await Message.create(
        {
          ticket_id: mappedTicketId,
          text: oldReply.content.trim(),
          senderType,
          files: [],
          createdAt: parseDate(oldReply.create_date),
          updatedAt: parseDate(oldReply.create_date),
        },
        { transaction },
      );
    }

    await transaction.commit();

    console.log("✅ مهاجرت تستی با موفقیت به پایان رسید.");
    console.log(`تیکت‌های منتقل شده: ${ticketIdMap.size}`);
    console.log(
      `پیام‌های ناموفق به دلیل عدم وجود کاربر: ${unresolvedUsers.length}`,
    );

    if (unresolvedUsers.length > 0) {
      console.log(
        "⚠️ نمونه تیکت‌هایی که کاربر معادلشان در دیتابیس جدید وجود نداشت:",
      );
      console.log(unresolvedUsers.slice(0, 5));
    }
  } catch (error) {
    await transaction.rollback();
    console.error("❌ خطا در اجرای عملیات مهاجرت:", error);
  }
}

migrate();
