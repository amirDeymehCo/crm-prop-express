const Controllers = require("../../../controllers");
const User = require("../../../../models/User");
const UserChallenge = require("../../../../models/Challenge/UserChallenge");
const founcList = require("../../../../utils/List");
const { Op, literal } = require("sequelize");

const Controller = class extends Controllers {
  async listUsers(req, res) {
    const where = {};
    const { query } = req;

    if (query?.mobile) {
      where.mobile = { [Op.like]: `%${query.mobile}%` };
    }
    if (query?.lastname) {
      where.lastname = { [Op.like]: `%${query.lastname}%` };
    }
    if (query?.firstname) {
      where.firstname = { [Op.like]: `%${query.firstname}%` };
    }
    if (query?.id) {
      where.id = { [Op.like]: `%${query.id}%` };
    }
    if (query?.from || query?.to) {
      where.createdAt = {};
      if (query.from) {
        where.createdAt[Op.gte] = new Date(query.from);
      }
      if (query.to) {
        where.createdAt[Op.lte] = new Date(query.to);
      }
    }
    if (query?.status) {
      where.status = query.status;
    }
    if (query?.kyc_status) {
      where.kyc_status = query.kyc_status;
    }

    const list = await founcList(User, req, where, {
      attributes: [
        "id",
        "avatar",
        "firstname",
        "lastname",
        "mobile",
        "status",
        "createdAt",
        "kyc_steep",
        "kyc_status",
        [
          literal(`(
            SELECT COUNT(*)
            FROM call_history AS c
            WHERE c.user_id = User.id
          )`),
          "calls_count",
        ],
        [
          literal(`(
            SELECT c.date_create_call
            FROM call_history AS c
            WHERE c.user_id = User.id
            ORDER BY c.date_create_call DESC, c.id DESC
            LIMIT 1
          )`),
          "last_call_date",
        ],
        [
          literal(`(
    SELECT a.name 
    FROM call_history AS c 
    INNER JOIN Admins AS a ON c.admin_id = a.id 
    WHERE c.user_id = User.id 
    ORDER BY c.id DESC LIMIT 1
  )`),
          "last_call_admin_name",
        ],
        [
          literal(`(
    SELECT a.name 
    FROM Admins AS a 
    WHERE a.id = User.responsible_admin_id
  )`),
          "responsible_admin",
        ],
      ],
      order: [["id", "ASC"]],
    });

    this.response({
      res,
      message: "لیست کاربران به همراه وضعیت تماس‌ها",
      data: list,
    });
  }
  async listUsersByChallenge(req, res) {
    const { query } = req;
    const where = {};
    const challengeWhere = {};

    if (query?.mobile) where.mobile = { [Op.like]: `%${query.mobile}%` };
    if (query?.lastname) where.lastname = { [Op.like]: `%${query.lastname}%` };
    if (query?.firstname)
      where.firstname = { [Op.like]: `%${query.firstname}%` };
    if (query?.id) where.id = query.id;

    if (query?.from || query?.to) {
      where.createdAt = {};
      if (query.from) where.createdAt[Op.gte] = new Date(query.from);
      if (query.to) where.createdAt[Op.lte] = new Date(query.to);
    }

    if (query?.challenge_status) {
      challengeWhere.status = query.challenge_status;
    }

    const list = await founcList(User, req, where, {
      attributes: [
        "id",
        "avatar",
        "firstname",
        "lastname",
        "mobile",
        "status",
        "createdAt",
        [
          literal(
            `(SELECT COUNT(*) FROM call_history WHERE user_id = User.id)`,
          ),
          "calls_count",
        ],
        [
          literal(
            `(SELECT date_create_call FROM call_history WHERE user_id = User.id ORDER BY id DESC LIMIT 1)`,
          ),
          "last_call_date",
        ],
        [
          literal(`(
    SELECT a.name 
    FROM call_history AS c 
    INNER JOIN Admins AS a ON c.admin_id = a.id 
    WHERE c.user_id = User.id 
    ORDER BY c.id DESC LIMIT 1
  )`),
          "last_call_admin_name",
        ],
        [
          literal(`(
    SELECT a.name 
    FROM Admins AS a 
    WHERE a.id = User.responsible_admin_id
  )`),
          "responsible_admin",
        ],
      ],
      include: [
        {
          model: UserChallenge,
          where: challengeWhere,
          required: !!query?.challenge_status, // اگر فیلتر نبود، Left Join و اگر بود Inner Join
          attributes: [], // دیتای اضافه از چالش نمی‌خواهیم، فقط برای فیلتر است
        },
      ],
      group: ["User.id"],
      subQuery: false,
      order: [["id", "ASC"]],
    });

    this.response({
      res,
      message: "لیست کاربران فیلتر شده بر اساس چالش",
      data: list,
    });
  }
  async listUsersByManyActiveChallenges(req, res) {
    const { query } = req;
    const where = {};
    const challengeWhere = {};

    // فیلترهای کاربر
    if (query?.mobile) where.mobile = { [Op.like]: `%${query.mobile}%` };
    if (query?.lastname) where.lastname = { [Op.like]: `%${query.lastname}%` };
    if (query?.firstname)
      where.firstname = { [Op.like]: `%${query.firstname}%` };
    if (query?.id) where.id = query.id;

    if (query?.from || query?.to) {
      where.createdAt = {};
      if (query.from) where.createdAt[Op.gte] = new Date(query.from);
      if (query.to) where.createdAt[Op.lte] = new Date(query.to);
    }

    // active های شما
    const activeStatuses = ["phase1", "phase2", "real"];

    // اگر خواستی از بیرون هم فیلتر بدی، ولی پیش‌فرض همین سه تاست
    challengeWhere.status = { [Op.in]: activeStatuses };

    // حداقل تعداد چالش فعال برای لید
    const minChallenges = Number(query?.min_active_challenges) || 4;

    const list = await founcList(User, req, where, {
      attributes: [
        "id",
        "avatar",
        "firstname",
        "lastname",
        "mobile",
        "status",
        "createdAt",
        [
          literal(`(
          SELECT COUNT(*)
          FROM call_history AS c
          WHERE c.user_id = User.id
        )`),
          "calls_count",
        ],
        [
          literal(`(
          SELECT c.date_create_call
          FROM call_history AS c
          WHERE c.user_id = User.id
          ORDER BY c.date_create_call DESC, c.id DESC
          LIMIT 1
        )`),
          "last_call_date",
        ],
        [
          literal(`(
          SELECT a.name
          FROM call_history AS c
          INNER JOIN Admins AS a ON c.admin_id = a.id
          WHERE c.user_id = User.id
          ORDER BY c.id DESC
          LIMIT 1
        )`),
          "last_call_admin_name",
        ],
        [
          literal(`(
          SELECT a.name
          FROM Admins AS a
          WHERE a.id = User.responsible_admin_id
        )`),
          "responsible_admin",
        ],
        [
          literal(`(
    SELECT COUNT(*)
    FROM user_challenges AS uc
    WHERE uc.user_id = User.id
      AND uc.status IN ('phase1', 'phase2', 'real')
  )`),
          "active_challenges_count",
        ],
      ],
      include: [
        {
          model: UserChallenge,
          where: challengeWhere,
          required: true,
          attributes: [],
        },
      ],

      group: ["User.id"],

      having: literal(`
  (
    SELECT COUNT(*)
    FROM user_challenges AS uc
    WHERE uc.user_id = User.id
      AND uc.status IN ('phase1', 'phase2', 'real')
  ) >= ${minChallenges}
`),

      subQuery: false,

      order: [[literal("active_challenges_count"), "DESC"]],
    });

    this.response({
      res,
      message: "لیست کاربران با تعداد زیاد چالش فعال",
      data: list,
    });
  }
  async listUsersNeverPurchased(req, res) {
    const { query } = req;
    const where = {};

    // -------------------------
    // فیلترهای User
    // -------------------------

    if (query?.mobile) {
      where.mobile = {
        [Op.like]: `%${query.mobile}%`,
      };
    }

    if (query?.lastname) {
      where.lastname = {
        [Op.like]: `%${query.lastname}%`,
      };
    }

    if (query?.firstname) {
      where.firstname = {
        [Op.like]: `%${query.firstname}%`,
      };
    }

    if (query?.id) {
      where.id = query.id;
    }

    // فیلتر تاریخ ثبت‌نام
    if (query?.from || query?.to) {
      where.createdAt = {};

      if (query.from) {
        where.createdAt[Op.gte] = new Date(query.from);
      }

      if (query.to) {
        where.createdAt[Op.lte] = new Date(query.to);
      }
    }

    const list = await founcList(User, req, where, {
      attributes: [
        "id",
        "avatar",
        "firstname",
        "lastname",
        "mobile",
        "status",
        "createdAt",

        // تعداد تماس‌ها
        [
          literal(`
          (
            SELECT COUNT(*)
            FROM call_history AS c
            WHERE c.user_id = User.id
          )
        `),
          "calls_count",
        ],

        // آخرین تماس
        [
          literal(`
          (
            SELECT c.date_create_call
            FROM call_history AS c
            WHERE c.user_id = User.id
            ORDER BY c.date_create_call DESC, c.id DESC
            LIMIT 1
          )
        `),
          "last_call_date",
        ],

        // ادمین آخرین تماس
        [
          literal(`
          (
            SELECT a.name
            FROM call_history AS c
            INNER JOIN Admins AS a
              ON c.admin_id = a.id
            WHERE c.user_id = User.id
            ORDER BY c.id DESC
            LIMIT 1
          )
        `),
          "last_call_admin_name",
        ],

        // مسئول کاربر
        [
          literal(`
          (
            SELECT a.name
            FROM Admins AS a
            WHERE a.id = User.responsible_admin_id
          )
        `),
          "responsible_admin",
        ],

        // تعداد چالش‌های کاربر
        [
          literal(`
          (
            SELECT COUNT(*)
            FROM user_challenges AS uc
            WHERE uc.user_id = User.id
          )
        `),
          "challenges_count",
        ],
      ],

      // فقط کاربرانی که هیچ UserChallenge ندارند
      include: [
        {
          model: UserChallenge,
          required: false,
          attributes: [],
        },
      ],

      group: ["User.id"],

      // هیچ چالشی نداشته باشد
      having: literal(`
      COUNT(UserChallenges.id) = 0
    `),

      subQuery: false,

      order: [["createdAt", "DESC"]],
    });

    this.response({
      res,
      message: "لیست کاربران بدون خرید",
      data: list,
    });
  }
  async listUsersByManyClosedChallenges(req, res) {
    const { query } = req;
    const where = {};

    // -------------------------
    // فیلترهای User
    // -------------------------

    if (query?.mobile) {
      where.mobile = {
        [Op.like]: `%${query.mobile}%`,
      };
    }

    if (query?.lastname) {
      where.lastname = {
        [Op.like]: `%${query.lastname}%`,
      };
    }

    if (query?.firstname) {
      where.firstname = {
        [Op.like]: `%${query.firstname}%`,
      };
    }

    if (query?.id) {
      where.id = query.id;
    }

    if (query?.from || query?.to) {
      where.createdAt = {};

      if (query.from) {
        where.createdAt[Op.gte] = new Date(query.from);
      }

      if (query.to) {
        where.createdAt[Op.lte] = new Date(query.to);
      }
    }

    // حداقل تعداد چالش بسته شده
    const minClosedChallenges = Number(query?.min_closed_challenges) || 6;

    const list = await founcList(User, req, where, {
      attributes: [
        "id",
        "avatar",
        "firstname",
        "lastname",
        "mobile",
        "status",
        "createdAt",

        // تعداد کل تماس‌ها
        [
          literal(`
          (
            SELECT COUNT(*)
            FROM call_history AS c
            WHERE c.user_id = User.id
          )
        `),
          "calls_count",
        ],

        // آخرین تماس
        [
          literal(`
          (
            SELECT c.date_create_call
            FROM call_history AS c
            WHERE c.user_id = User.id
            ORDER BY c.date_create_call DESC, c.id DESC
            LIMIT 1
          )
        `),
          "last_call_date",
        ],

        // ادمین آخرین تماس
        [
          literal(`
          (
            SELECT a.name
            FROM call_history AS c
            INNER JOIN Admins AS a
              ON c.admin_id = a.id
            WHERE c.user_id = User.id
            ORDER BY c.id DESC
            LIMIT 1
          )
        `),
          "last_call_admin_name",
        ],

        // مسئول کاربر
        [
          literal(`
          (
            SELECT a.name
            FROM Admins AS a
            WHERE a.id = User.responsible_admin_id
          )
        `),
          "responsible_admin",
        ],

        // تعداد چالش‌های closed
        [
          literal(`
          (
            SELECT COUNT(*)
            FROM user_challenges AS uc
            WHERE uc.user_id = User.id
              AND uc.status = 'closed'
          )
        `),
          "closed_challenges_count",
        ],
      ],

      include: [
        {
          model: UserChallenge,
          where: {
            status: "closed",
          },
          required: true,
          attributes: [],
        },
      ],

      group: ["User.id"],

      // حداقل X چالش closed
      having: literal(`
      COUNT(UserChallenges.id) >= ${minClosedChallenges}
    `),

      subQuery: false,

      order: [[literal("closed_challenges_count"), "DESC"]],
    });

    this.response({
      res,
      message: "لیست کاربران با تعداد زیاد چالش بسته شده",
      data: list,
    });
  }
};

module.exports = new Controller();
