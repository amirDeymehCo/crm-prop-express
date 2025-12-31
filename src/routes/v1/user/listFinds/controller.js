const Controllers = require("../../../controllers");
const UserChallenges = require("../../../../models/Challenge/UserChallenge")
const ChallengePlan = require("../../../../models/Challenge/ChallengePlan")
const ChallengeType = require("../../../../models/Challenge/ChallengeType")

const Controller = class extends Controllers {
    async challenges(req, res) {

        const where = { user_id: req?.user?.id }
        if (req?.query?.current_phase_index) where.current_phase_index = req?.query?.current_phase_index

        const list = await UserChallenges.findAll({
            where,
            attributes: ["id", "status", "current_phase_index"], include: [{
                model: ChallengePlan,
                attributes: ["id", "title", "balance"],
                include: [
                    ChallengeType
                ]
            }]
        });


        this.response({ res, status: 200, message: "لیست چالش های شما به صورت خلاصه", data: list })
    }
};

module.exports = new Controller();
