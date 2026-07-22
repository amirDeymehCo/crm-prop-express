const { callMeta } = require("./metaAnalysisClient");

const MAIN_KEY = process.env.META_ANALYSIS_MAIN_KEY;
// const MAIN_KEY = "Mylafjdto#@hreogfh436t3458Prop";
const PERF_KEY = process.env.META_ANALYSIS_PERF_KEY;

async function fetchFullAccountAnalysis(login) {
  if (!login || login <= 0) return null;

  const [stats, openPositions, closedPositions, perf, info] = await Promise.all(
    [
      callMeta("/get_analysis_ctrader.php", { login }, MAIN_KEY),
      callMeta("/get_open_positions.php", { login }, MAIN_KEY),
      callMeta("/ctrader_closed-positions-api.php", { login }, MAIN_KEY),
      callMeta(
        "/ctrader-login-rights-api.php",
        { login, page: 1, per_page: 200 },
        MAIN_KEY,
      ),
      callMeta("/performance_stability.php", { login }, PERF_KEY),
      callMeta("/get_info_login.php", { login }, MAIN_KEY),
    ],
  );

  return {
    stats,
    openPositions: openPositions?.data ?? [],
    closedPositions: closedPositions?.positions ?? [],
    performance: perf,
    baseBalanceDaily: info?.stops?.base_balance_daily ?? null,
    fetchedAt: new Date(),
  };
}

module.exports = { fetchFullAccountAnalysis };
