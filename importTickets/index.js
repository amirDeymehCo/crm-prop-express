const fs = require("fs");
const path = require("path");
const sequelize = require("../db");

const User = require("../src/models/User");
const Ticket = require("../src/models/Ticket");
const Message = require("../src/models/Message");

const LIMIT = Number.MAX_SAFE_INTEGER;
const BATCH_SIZE = 2000;
const LOG_INTERVAL_TICKETS = 20;
const LOG_INTERVAL_REPLIES = 50;

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

  const oldTickets = allOldTickets.slice(0, LIMIT);
  const allowedOldTicketIds = new Set(
    oldTickets.map((ticket) => Number(ticket.ID)),
  );

  const oldReplies = allOldReplies.filter((reply) =>
    allowedOldTicketIds.has(Number(reply.ticket_id)),
  );

  // پاسخ‌ها را یک‌بار بر اساس شناسه تیکت گروه‌بندی می‌کنیم.
  const repliesByTicketId = new Map();

  for (const reply of oldReplies) {
    const oldTicketId = Number(reply.ticket_id);

    if (!repliesByTicketId.has(oldTicketId)) {
      repliesByTicketId.set(oldTicketId, []);
    }

    repliesByTicketId.get(oldTicketId).push(reply);
  }

  console.log(`شروع مهاجرت ${oldTickets.length} تیکت`);
  console.log(`تعداد پاسخ‌های مرتبط: ${oldReplies.length}`);
  console.log(`اندازه هر batch: ${BATCH_SIZE}`);

  const userMap = await buildUserMap();
  const unresolvedUsers = [];

  let processedTicketsCount = 0;
  let insertedTicketsCount = 0;
  let insertedInitialMessagesCount = 0;
  let processedRepliesCount = 0;
  let insertedRepliesCount = 0;
  let committedBatchesCount = 0;

  try {
    for (
      let batchStart = 0;
      batchStart < oldTickets.length;
      batchStart += BATCH_SIZE
    ) {
      const batchNumber = Math.floor(batchStart / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(oldTickets.length / BATCH_SIZE);
      const batchTickets = oldTickets.slice(
        batchStart,
        batchStart + BATCH_SIZE,
      );

      console.log(
        `\n[Batch ${batchNumber}/${totalBatches}] شروع پردازش تیکت‌های ${
          batchStart + 1
        } تا ${batchStart + batchTickets.length}`,
      );

      const transaction = await sequelize.transaction({
        logging: false,
      });

      const batchTicketIdMap = new Map();
      let batchInsertedTicketsCount = 0;
      let batchInsertedRepliesCount = 0;

      try {
        for (const oldTicket of batchTickets) {
          processedTicketsCount++;

          const oldTicketId = Number(oldTicket.ID);
          const oldCustomerId = getOldCustomerId(oldTicket);
          const newUserId = oldCustomerId ? userMap.get(oldCustomerId) : null;

          if (!newUserId) {
            unresolvedUsers.push({
              oldTicketId: oldTicket.ID,
              oldCustomerId,
              title: oldTicket.title,
            });
          } else {
            const normalizedStatus = normalizeStatus(oldTicket.status);

            const newTicket = await Ticket.create(
              {
                user_id: newUserId,
                type: "ticket",
                title: oldTicket.title?.trim() || "بدون عنوان",
                files: null,
                departeman: normalizeDepartment(oldTicket.department_id),
                priority: normalizePriority(oldTicket.priority),
                status: normalizedStatus,
                closed_at:
                  normalizedStatus === "ticket_closed"
                    ? parseDate(oldTicket.reply_date || oldTicket.create_date)
                    : null,
                createdByAdmin: Number(oldTicket.from_admin) === 1,
                createdAt: parseDate(oldTicket.create_date),
                updatedAt: parseDate(
                  oldTicket.reply_date || oldTicket.create_date,
                ),
                legacy_ticket_id: oldTicket?.ID,
              },
              {
                transaction,
                logging: false,
              },
            );

            batchTicketIdMap.set(oldTicketId, newTicket.id);
            batchInsertedTicketsCount++;

            if (oldTicket.content?.trim()) {
              await Message.create(
                {
                  ticket_id: newTicket.id,
                  text: oldTicket.content.trim(),
                  senderType:
                    Number(oldTicket.from_admin) === 1 ? "admin" : "user",
                  files: [],
                  createdAt: parseDate(oldTicket.create_date),
                  updatedAt: parseDate(oldTicket.create_date),
                },
                {
                  transaction,
                  logging: false,
                },
              );

              insertedInitialMessagesCount++;
            }
          }

          if (
            processedTicketsCount % LOG_INTERVAL_TICKETS === 0 ||
            processedTicketsCount === oldTickets.length
          ) {
            console.log(
              `[Tickets] بررسی‌شده: ${processedTicketsCount}/${oldTickets.length} | ثبت‌شده تا این batch: ${batchInsertedTicketsCount} | بدون کاربر: ${unresolvedUsers.length}`,
            );
          }
        }

        // پاسخ‌های تیکت‌های موفق همین batch را داخل همان تراکنش ثبت می‌کنیم.
        for (const [oldTicketId, newTicketId] of batchTicketIdMap) {
          const ticketReplies = repliesByTicketId.get(oldTicketId) || [];

          // ترتیب تاریخی پیام‌ها حفظ شود.
          ticketReplies.sort(
            (firstReply, secondReply) =>
              parseDate(firstReply.create_date).getTime() -
              parseDate(secondReply.create_date).getTime(),
          );

          for (const oldReply of ticketReplies) {
            processedRepliesCount++;

            if (!oldReply.content?.trim()) {
              continue;
            }

            const replyCreatorId = oldReply.creator_id
              ? Number(oldReply.creator_id)
              : null;

            const senderType =
              replyCreatorId && userMap.has(replyCreatorId) ? "user" : "admin";

            await Message.create(
              {
                ticket_id: newTicketId,
                text: oldReply.content.trim(),
                senderType,
                files: [],
                createdAt: parseDate(oldReply.create_date),
                updatedAt: parseDate(oldReply.create_date),
              },
              {
                transaction,
                logging: false,
              },
            );

            batchInsertedRepliesCount++;

            if (processedRepliesCount % LOG_INTERVAL_REPLIES === 0) {
              console.log(
                `[Replies] بررسی‌شده: ${processedRepliesCount}/${oldReplies.length}`,
              );
            }
          }
        }

        await transaction.commit();

        insertedTicketsCount += batchInsertedTicketsCount;
        insertedRepliesCount += batchInsertedRepliesCount;
        committedBatchesCount++;

        console.log(
          `[Batch ${batchNumber}/${totalBatches}] کامیت شد | تیکت: ${batchInsertedTicketsCount} | پاسخ: ${batchInsertedRepliesCount}`,
        );

        console.log(
          `[Total] تیکت ثبت‌شده: ${insertedTicketsCount} | پاسخ ثبت‌شده: ${insertedRepliesCount} | بدون کاربر: ${unresolvedUsers.length}`,
        );
      } catch (batchError) {
        await transaction.rollback();

        console.error(
          `\nخطا در batch ${batchNumber}; تغییرات همین batch rollback شد.`,
        );

        throw batchError;
      }
    }

    console.log("\nمهاجرت با موفقیت به پایان رسید.");
    console.log(`Batchهای کامیت‌شده: ${committedBatchesCount}`);
    console.log(`تیکت‌های بررسی‌شده: ${processedTicketsCount}`);
    console.log(`تیکت‌های منتقل‌شده: ${insertedTicketsCount}`);
    console.log(`پیام‌های اولیه ثبت‌شده: ${insertedInitialMessagesCount}`);
    console.log(`پاسخ‌های ثبت‌شده: ${insertedRepliesCount}`);
    console.log(`تیکت‌های بدون کاربر متناظر: ${unresolvedUsers.length}`);

    if (unresolvedUsers.length > 0) {
      console.log("\nنمونه تیکت‌های بدون کاربر متناظر:");
      console.log(unresolvedUsers.slice(0, 10));
    }
  } catch (error) {
    console.error("\nمهاجرت متوقف شد:", error);
    console.log(`آخرین batch کامیت‌شده: ${committedBatchesCount}`);
    console.log(`تیکت‌های کامیت‌شده: ${insertedTicketsCount}`);
    console.log(`پاسخ‌های کامیت‌شده: ${insertedRepliesCount}`);

    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

migrate();
