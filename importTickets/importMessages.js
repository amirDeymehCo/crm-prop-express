const fs = require("fs");
const path = require("path");
const { Op } = require("sequelize");

const sequelize = require("../db");

const User = require("../src/models/User");
const Ticket = require("../src/models/Ticket");
const Message = require("../src/models/Message");

/**
 * این اسکریپت فقط پیام‌های تیکت‌ها را دوباره migrate می‌کند.
 * فرض: تیکت‌ها قبلاً migrate شده‌اند و Messages حذف شده‌اند.
 */

const LIMIT = Number.MAX_SAFE_INTEGER;
const BATCH_SIZE = 2000;

const LOG_INTERVAL_TICKETS = 100;
const LOG_INTERVAL_MESSAGES = 500;

const USE_LEGACY_TICKET_ID = true;

/**
 * اگر legacy_ticket_id نداری، این را false کن.
 * ولی حتماً توضیحات پایین فایل را بخوان.
 *
 * در حالت false، اسکریپت تلاش می‌کند oldTicketهای قابل انتقال را
 * با Ticketهای جدید بر اساس ترتیب id جفت کند.
 */

const DELETE_EXISTING_MESSAGES_BEFORE_INSERT = false;

/**
 * اگر مطمئنی Messages خالی نیست و می‌خواهی قبل از insert پاک شوند، true کن.
 * چون گفتی همه پیام‌ها را حذف کردی، فعلاً false بهتر است.
 */

function parseDate(value) {
  if (!value) return new Date();

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
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
    throw new Error(`Table data not found: ${tableName}`);
  }

  return table.data;
}

function getOldCustomerId(oldTicket) {
  if (oldTicket.user_id) {
    return Number(oldTicket.user_id);
  }

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

  const userMap = new Map();

  for (const user of users) {
    if (user.legacy_user_id != null) {
      userMap.set(Number(user.legacy_user_id), Number(user.id));
    }
  }

  return userMap;
}

function groupRepliesByTicketId(replies) {
  const repliesByTicketId = new Map();

  for (const reply of replies) {
    const oldTicketId = Number(reply.ticket_id);

    if (!repliesByTicketId.has(oldTicketId)) {
      repliesByTicketId.set(oldTicketId, []);
    }

    repliesByTicketId.get(oldTicketId).push(reply);
  }

  for (const ticketReplies of repliesByTicketId.values()) {
    ticketReplies.sort((a, b) => {
      const dateA = parseDate(a.create_date).getTime();
      const dateB = parseDate(b.create_date).getTime();

      if (dateA !== dateB) return dateA - dateB;

      return Number(a.ID || a.id || 0) - Number(b.ID || b.id || 0);
    });
  }

  return repliesByTicketId;
}

function detectInitialMessageSenderType(oldTicket) {
  return Number(oldTicket.from_admin) === 1 ? "admin" : "user";
}

/**
 * تشخیص صحیح senderType برای replyها
 *
 * اولویت 1:
 * اگر خود reply فیلد from_admin داشته باشد، همان معتبرترین است.
 *
 * اولویت 2:
 * اگر creator_id با oldCustomerId صاحب تیکت یکی باشد، user.
 *
 * اولویت 3:
 * در غیر این صورت admin.
 */
function detectReplySenderType(oldReply, oldCustomerId) {
  if (
    Object.prototype.hasOwnProperty.call(oldReply, "from_admin") &&
    oldReply.from_admin !== null &&
    oldReply.from_admin !== undefined &&
    oldReply.from_admin !== ""
  ) {
    return Number(oldReply.from_admin) === 1 ? "admin" : "user";
  }

  const replyCreatorId = oldReply.creator_id
    ? Number(oldReply.creator_id)
    : null;

  if (replyCreatorId && oldCustomerId && replyCreatorId === oldCustomerId) {
    return "user";
  }

  return "admin";
}

function normalizeText(value) {
  if (!value) return null;

  const text = String(value).trim();

  return text || null;
}

async function buildTicketIdMapByLegacyTicketId(migratedOldTickets) {
  const oldTicketIds = migratedOldTickets.map((ticket) => Number(ticket.ID));

  const newTickets = await Ticket.findAll({
    attributes: ["id", "legacy_ticket_id"],
    where: {
      legacy_ticket_id: {
        [Op.in]: oldTicketIds,
      },
    },
    raw: true,
  });

  const ticketIdMap = new Map();

  for (const ticket of newTickets) {
    if (ticket.legacy_ticket_id != null) {
      ticketIdMap.set(Number(ticket.legacy_ticket_id), Number(ticket.id));
    }
  }

  return ticketIdMap;
}

/**
 * Fallback خطرناک‌تر:
 * فقط زمانی استفاده کن که:
 * 1. قبل از مهاجرت جدول Ticket خالی بوده
 * 2. هم‌زمان هیچ تیکتی توسط کاربر ساخته نشده
 * 3. تیکت‌ها دقیقاً با ترتیب فایل JSON ساخته شده‌اند
 * 4. تعداد Ticketهای فعلی دقیقاً برابر migratedOldTickets است
 */
async function buildTicketIdMapByOrder(migratedOldTickets) {
  const newTickets = await Ticket.findAll({
    attributes: ["id", "createdAt", "title", "user_id"],
    order: [["id", "ASC"]],
    raw: true,
  });

  if (newTickets.length !== migratedOldTickets.length) {
    throw new Error(
      [
        "Unsafe ordered mapping.",
        `Migrated old tickets count: ${migratedOldTickets.length}`,
        `New tickets count: ${newTickets.length}`,
        "تعداد تیکت‌های جدید با تعداد تیکت‌های قابل انتقال قدیمی برابر نیست.",
        "اگر legacy_ticket_id نداری، باید بازه تیکت‌های migrate شده را دقیق‌تر مشخص کنیم.",
      ].join("\n"),
    );
  }

  const ticketIdMap = new Map();

  for (let index = 0; index < migratedOldTickets.length; index++) {
    const oldTicket = migratedOldTickets[index];
    const newTicket = newTickets[index];

    ticketIdMap.set(Number(oldTicket.ID), Number(newTicket.id));
  }

  return ticketIdMap;
}

async function testSenderTypeSupport(existingTicketId) {
  const transaction = await sequelize.transaction();

  try {
    const testMessage = await Message.create(
      {
        ticket_id: existingTicketId,
        text: "__senderType_admin_test__",
        senderType: "admin",
        files: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        transaction,
        logging: false,
      },
    );

    const reloaded = await Message.findByPk(testMessage.id, {
      raw: true,
      transaction,
      logging: false,
    });

    if (!reloaded || reloaded.senderType !== "admin") {
      throw new Error(
        `Message.senderType admin test failed. Saved value: ${reloaded?.senderType}`,
      );
    }

    await transaction.rollback();

    console.log("✅ تست ذخیره senderType='admin' موفق بود.");
  } catch (error) {
    await transaction.rollback();

    throw error;
  }
}

async function migrateMessages() {
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

  const repliesByTicketId = groupRepliesByTicketId(oldReplies);

  console.log("🚀 Started..");
  console.log(`Old Tickets: ${oldTickets.length}`);
  console.log(`Old Messages ${oldReplies.length}`);

  const userMap = await buildUserMap();

  const migratedOldTickets = [];
  const unresolvedTickets = [];

  for (const oldTicket of oldTickets) {
    const oldTicketId = Number(oldTicket.ID);
    const oldCustomerId = getOldCustomerId(oldTicket);
    const newUserId = oldCustomerId ? userMap.get(oldCustomerId) : null;

    if (!newUserId) {
      unresolvedTickets.push({
        oldTicketId,
        oldCustomerId,
        title: oldTicket.title,
      });

      continue;
    }

    migratedOldTickets.push(oldTicket);
  }

  console.log(`this ticket message length: ${migratedOldTickets.length}`);
  console.log(`tickets user mapping: ${unresolvedTickets.length}`);

  let ticketIdMap;

  if (USE_LEGACY_TICKET_ID) {
    console.log("در حال ساخت map با legacy_ticket_id...");

    ticketIdMap = await buildTicketIdMapByLegacyTicketId(migratedOldTickets);

    console.log(`تعداد ticket map ساخته‌شده: ${ticketIdMap.size}`);

    if (ticketIdMap.size !== migratedOldTickets.length) {
      const missingCount = migratedOldTickets.length - ticketIdMap.size;

      throw new Error(
        [
          "Legacy ticket mapping incomplete.",
          `Expected: ${migratedOldTickets.length}`,
          `Mapped: ${ticketIdMap.size}`,
          `Missing: ${missingCount}`,
          "احتمالاً همه Ticketها legacy_ticket_id ندارند.",
          "اگر legacy_ticket_id نداری، USE_LEGACY_TICKET_ID را false کن؛ اما اول توضیحات fallback را بخوان.",
        ].join("\n"),
      );
    }
  } else {
    console.log("⚠️ در حال ساخت map بر اساس ترتیب Ticket.id");
    console.log(
      "⚠️ این روش فقط اگر دیتابیس شرایط fallback را داشته باشد امن است.",
    );

    ticketIdMap = await buildTicketIdMapByOrder(migratedOldTickets);

    console.log(`تعداد ticket map ساخته‌شده: ${ticketIdMap.size}`);
  }

  const firstNewTicketId = ticketIdMap.get(Number(migratedOldTickets[0].ID));

  if (!firstNewTicketId) {
    throw new Error("هیچ تیکت مقصدی برای تست senderType پیدا نشد.");
  }

  await testSenderTypeSupport(firstNewTicketId);

  const existingMessagesCount = await Message.count();

  if (existingMessagesCount > 0) {
    console.log(`⚠️ تعداد پیام‌های فعلی دیتابیس: ${existingMessagesCount}`);

    if (!DELETE_EXISTING_MESSAGES_BEFORE_INSERT) {
      throw new Error(
        [
          "Messages table is not empty.",
          "برای جلوگیری از duplicate، یا Messages را دستی خالی کن،",
          "یا DELETE_EXISTING_MESSAGES_BEFORE_INSERT را true قرار بده.",
        ].join("\n"),
      );
    }

    console.log("🧹 حذف پیام‌های موجود...");

    await Message.destroy({
      where: {},
      truncate: false,
      logging: false,
    });

    console.log("✅ پیام‌های قبلی حذف شدند.");
  }

  let processedTicketsCount = 0;
  let insertedInitialMessagesCount = 0;
  let processedRepliesCount = 0;
  let insertedRepliesCount = 0;
  let skippedEmptyInitialMessagesCount = 0;
  let skippedEmptyRepliesCount = 0;
  let committedBatchesCount = 0;

  let initialUserMessagesCount = 0;
  let initialAdminMessagesCount = 0;
  let replyUserMessagesCount = 0;
  let replyAdminMessagesCount = 0;

  try {
    for (
      let batchStart = 0;
      batchStart < migratedOldTickets.length;
      batchStart += BATCH_SIZE
    ) {
      const batchNumber = Math.floor(batchStart / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(migratedOldTickets.length / BATCH_SIZE);

      const batchTickets = migratedOldTickets.slice(
        batchStart,
        batchStart + BATCH_SIZE,
      );

      console.log(
        `\n[Batch ${batchNumber}/${totalBatches}] شروع بازسازی پیام برای ${
          batchTickets.length
        } تیکت`,
      );

      const transaction = await sequelize.transaction({
        logging: false,
      });

      let batchInsertedInitialMessagesCount = 0;
      let batchInsertedRepliesCount = 0;

      try {
        for (const oldTicket of batchTickets) {
          processedTicketsCount++;

          const oldTicketId = Number(oldTicket.ID);
          const oldCustomerId = getOldCustomerId(oldTicket);
          const newTicketId = ticketIdMap.get(oldTicketId);

          if (!newTicketId) {
            throw new Error(
              `New ticket id not found for oldTicketId=${oldTicketId}`,
            );
          }

          const initialMessageText = normalizeText(oldTicket.content);

          if (initialMessageText) {
            const senderType = detectInitialMessageSenderType(oldTicket);

            await Message.create(
              {
                ticket_id: newTicketId,
                text: initialMessageText,
                senderType,
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
            batchInsertedInitialMessagesCount++;

            if (senderType === "admin") {
              initialAdminMessagesCount++;
            } else {
              initialUserMessagesCount++;
            }
          } else {
            skippedEmptyInitialMessagesCount++;
          }

          const ticketReplies = repliesByTicketId.get(oldTicketId) || [];

          for (const oldReply of ticketReplies) {
            processedRepliesCount++;

            const replyText = normalizeText(oldReply.content);

            if (!replyText) {
              skippedEmptyRepliesCount++;
              continue;
            }

            const senderType = detectReplySenderType(oldReply, oldCustomerId);

            await Message.create(
              {
                ticket_id: newTicketId,
                text: replyText,
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

            insertedRepliesCount++;
            batchInsertedRepliesCount++;

            if (senderType === "admin") {
              replyAdminMessagesCount++;
            } else {
              replyUserMessagesCount++;
            }

            if (processedRepliesCount % LOG_INTERVAL_MESSAGES === 0) {
              console.log(
                `[Replies] : ${processedRepliesCount}/${oldReplies.length} | : ${insertedRepliesCount}`,
              );
            }
          }

          if (processedTicketsCount % LOG_INTERVAL_TICKETS === 0) {
            console.log(
              `[Tickets] : ${processedTicketsCount}/${migratedOldTickets.length} |  : ${insertedInitialMessagesCount} | : ${insertedRepliesCount}`,
            );
          }
        }

        await transaction.commit();

        committedBatchesCount++;

        console.log(
          `✅ [Batch ${batchNumber}/${totalBatches}] commited  | initial: ${batchInsertedInitialMessagesCount} | replies: ${batchInsertedRepliesCount}`,
        );
      } catch (batchError) {
        await transaction.rollback();

        console.error(
          `❌ Batch ${batchNumber} خطا خورد و تغییرات همین batch rollback شد.`,
        );

        throw batchError;
      }
    }

    const finalMessagesCount = await Message.count();

    console.log("\n✅ بازسازی پیام‌ها با موفقیت تم شد.");
    console.log("======================================");
    console.log(`Batchهای commit شده: ${committedBatchesCount}`);
    console.log(`تیکت‌های قابل بازسازی: ${migratedOldTickets.length}`);
    console.log(`تیکت‌های بدون user mapping: ${unresolvedTickets.length}`);
    console.log(`تیکت‌های پردازش‌شده: ${processedTicketsCount}`);
    console.log("--------------------------------------");
    console.log(`پیام‌های اولیه ثبت‌شده: ${insertedInitialMessagesCount}`);
    console.log(`پاسخ‌های ثبت‌شده: ${insertedRepliesCount}`);
    console.log(
      `کل پیام‌های ثبت‌شده: ${insertedInitialMessagesCount + insertedRepliesCount}`,
    );
    console.log(`Message.count نهایی: ${finalMessagesCount}`);
    console.log("--------------------------------------");
    console.log(`پیام اولیه user: ${initialUserMessagesCount}`);
    console.log(`پیام اولیه admin: ${initialAdminMessagesCount}`);
    console.log(`reply user: ${replyUserMessagesCount}`);
    console.log(`reply admin: ${replyAdminMessagesCount}`);
    console.log("--------------------------------------");
    console.log(
      `پیام اولیه خالی skip شده: ${skippedEmptyInitialMessagesCount}`,
    );
    console.log(`reply خالی skip شده: ${skippedEmptyRepliesCount}`);
    console.log("======================================");

    const senderTypeStats = await Message.findAll({
      attributes: [
        "senderType",
        [sequelize.fn("COUNT", sequelize.col("id")), "total"],
      ],
      group: ["senderType"],
      raw: true,
    });

    console.log("\nآمار senderType در دیتابیس:");
    console.table(senderTypeStats);
  } catch (error) {
    console.error("\n❌ بازسازی پیام‌ها متوقف شد:");
    console.error(error);

    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

migrateMessages();
