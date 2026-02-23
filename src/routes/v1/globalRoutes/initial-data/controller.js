const Controllers = require("../../../controllers");
const User = require("../../../../models/User");

const Controller = class extends Controllers {
  async importUsers(req, res) {
    try {
      // // 🔐 چک کردن api key
      // if (req.headers["x-import-key"] !== process.env.IMPORT_SECRET) {
      //   return this.response({
      //     res,
      //     status: 403,
      //     message: "دسترسی غیر مجاز",
      //   });
      // }

      const users = req.body?.users;

      if (!Array.isArray(users) || users.length === 0) {
        return this.response({
          res,
          status: 400,
          message: "لیست کاربران معتبر نیست",
        });
      }

      // گرفتن id های ورودی
      const incomingIds = users.map((u) => u.id);

      // پیدا کردن کاربرانی که از قبل وجود دارن
      const existingUsers = await User.findAll({
        where: {
          id: incomingIds,
        },
        attributes: ["id"],
      });

      const existingIds = existingUsers.map((u) => u.id);

      // فیلتر کردن کاربرانی که هنوز ساخته نشدن
      const newUsers = users.filter((u) => !existingIds.includes(u.id));

      if (newUsers.length === 0) {
        return this.response({
          res,
          status: 200,
          message: "همه کاربران قبلا ایمپورت شده‌اند",
        });
      }

      // ساخت bulk
      await User.bulkCreate(newUsers);

      return this.response({
        res,
        status: 201,
        message: `${newUsers.length} کاربر با موفقیت ایمپورت شد`,
      });
    } catch (error) {
      console.error(error);
      return this.response({
        res,
        status: 500,
        message: "خطا در ایمپورت کاربران",
      });
    }
  }
};

module.exports = new Controller();
