// seed/challenges.config.js

const challengesConfig = [
  {
    type: {
      name: "استاندارد",
      des: "مناسب برای شروع و تست نظم معاملاتی",
      logo: null,
      shand: "برای شروع",
    },
    plans: [
      {
        title: "حساب  1K",
        balance: 1000,
        price_usd: 13,
        leverage: 100,
        profit_share_percent: 8,

        phases: [
          {
            phase_index: 1,
            group: "evaluation",
            name: "مرحله اول",
            duration_days: 30,
            min_trading_days: 5,
            profit_target_percent: 8,
            max_daily_drawdown_percent: 5,
            max_overall_drawdown_percent: 10,
          },
          {
            phase_index: 2,
            group: "evaluation",
            name: "مرحله دوم",
            duration_days: 60,
            min_trading_days: 5,
            profit_target_percent: 5,
            max_daily_drawdown_percent: 5,
            max_overall_drawdown_percent: 10,
            phase_fee_usd: 49,
          },
          {
            phase_index: 3,
            group: "real",
            name: "حساب اصلی",
            profit_share_percent: 80,
          },
        ],
      },

      {
        title: "حساب 25K",
        balance: 25000,
        price_usd: 199,

        phases: [
          /* ... */
        ],
      },
    ],
  },
];

module.exports = challengesConfig;
