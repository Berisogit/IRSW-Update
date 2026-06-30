import { MenuItemProfitabilityRecord, MonthlyCOGSResult } from './foodCostService';

export interface ForecastItem {
  menuItemId: string;
  menuItemName: string;
  historicalQuantity: number;
  expectedQuantity: number;
  historicalRevenue: number;
  expectedRevenue: number;
  historicalCOGS: number;
  expectedCOGS: number;
  historicalProfit: number;
  expectedProfit: number;
  expectedMargin: number; // Percentage (0-100)
  confidenceScore: number; // Scale 0-100
  trend: 'UP' | 'DOWN' | 'STABLE';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface ScenarioParameters {
  orderGrowthRate: number; // Percentage offset, e.g. +10% or -5%
  cogsDriftRate: number;   // Percentage shift in ingredients cost
  priceAdjustment: number; // Percentage change in menu sell prices
}

export interface ForecastingReport {
  topRevenueForecast: ForecastItem[];
  topProfitForecast: ForecastItem[];
  slowMovingForecast: ForecastItem[];
  marginRiskForecast: ForecastItem[];
  
  // Scoring Ecosystem (0-100 scales)
  financialHealthScore: number;
  profitabilityScore: number;
  operationalIntegrityScore: number;
  inventoryIntegrityScore: number;
  growthScore: number;
  overallBusinessScore: number;

  // Forecast aggregative metrics
  consolidatedExpectedRevenue: number;
  consolidatedExpectedCOGS: number;
  consolidatedExpectedProfit: number;
  expectedFoodCostPercent: number;
}

export class ForecastingService {
  /**
   * Generates predictive analysis and forecasts based on raw historical records,
   * active scenarios, and administrative logs.
   * Runs in O(M) linear time where M is the unique menu items, supporting huge scales effortlessly.
   */
  public static projectForecasting(
    items: MenuItemProfitabilityRecord[],
    monthlyCogs: MonthlyCOGSResult | null,
    prevMonthlyCogs: MonthlyCOGSResult | null,
    reconciliationReport: { reconciliationScore: number; failedPostings: number; findings: any[] } | null,
    params: ScenarioParameters
  ): ForecastingReport {
    // 1. Map scenario weights
    const growthMult = 1 + (params.orderGrowthRate / 100);
    const costMult = 1 + (params.cogsDriftRate / 100);
    const priceMult = 1 + (params.priceAdjustment / 100);

    // 2. Perform element-wise linear prediction overlay (O(M) single pass)
    const projected: ForecastItem[] = items.map(item => {
      // Historical base metrics
      const baseQty = item.quantitySold;
      const baseRev = item.revenue;
      const baseCOGS = item.cogs;
      const baseProfit = item.grossProfit;

      // Project quantity based on global growth adjustments
      const expQty = baseQty * growthMult;

      // Rev projection = adjusted volume * adjusted price
      const expRev = baseRev * growthMult * priceMult;

      // COGS projection = adjusted volume * adjusted material cost
      const expCOGS = baseCOGS * growthMult * costMult;

      const expProfit = expRev - expCOGS;
      const expMargin = expRev > 0 ? (expProfit / expRev) * 100 : 0;

      // Calculate confidence index: combines sample size power and margin variability
      // Higher transaction sample size = higher statistical power
      const samplePower = Math.min(50, (baseQty / 50) * 50); // caps at 50 pts
      // Margin stability = lower standard variation or drift
      const matchesScenarioDrift = Math.abs(params.cogsDriftRate) < 15 ? 40 : 25; // 25-40 pts
      const baselineConsistency = item.marginPercent > 15 ? 10 : 5; // 5-10 pts
      const confidence = Math.round(samplePower + matchesScenarioDrift + baselineConsistency);

      // Deduce trend vector
      let trend: 'UP' | 'DOWN' | 'STABLE' = 'STABLE';
      const netMultiplier = growthMult * priceMult;
      if (netMultiplier > 1.05) trend = 'UP';
      else if (netMultiplier < 0.95) trend = 'DOWN';

      // Deduce risk profiling
      let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
      if (expMargin < 15 || expProfit < 0) {
        riskLevel = 'HIGH';
      } else if (expMargin < 30 || confidence < 60) {
        riskLevel = 'MEDIUM';
      }

      return {
        menuItemId: item.menuItemId,
        menuItemName: item.menuItemName,
        historicalQuantity: baseQty,
        expectedQuantity: Math.round(expQty * 10) / 10,
        historicalRevenue: baseRev,
        expectedRevenue: Math.round(expRev * 100) / 100,
        historicalCOGS: baseCOGS,
        expectedCOGS: Math.round(expCOGS * 100) / 100,
        historicalProfit: baseProfit,
        expectedProfit: Math.round(expProfit * 100) / 100,
        expectedMargin: Math.round(expMargin * 10) / 10,
        confidenceScore: Math.min(100, Math.max(0, confidence)),
        trend,
        riskLevel
      };
    });

    // 3. Segment classifications
    // A. Top Revenue: sorted by expected revenue decrescendo
    const topRevenueForecast = [...projected]
      .sort((a, b) => b.expectedRevenue - a.expectedRevenue)
      .slice(0, 5);

    // B. Top Profit: sorted by expected profit decrescendo
    const topProfitForecast = [...projected]
      .sort((a, b) => b.expectedProfit - a.expectedProfit)
      .slice(0, 5);

    // C. Likely Slow-Moving: low quantities sold historically, sorted ascending to highlight slow stock churn
    const slowMovingForecast = [...projected]
      .sort((a, b) => a.expectedQuantity - b.expectedQuantity)
      .slice(0, 5);

    // D. Margin Risk: lowest expected margins, focusing on items below target margins
    const marginRiskForecast = [...projected]
      .sort((a, b) => a.expectedMargin - b.expectedMargin)
      .slice(0, 5);

    // 4. Calculate overall forecasted aggregates
    const consolidatedExpectedRevenue = projected.reduce((acc, x) => acc + x.expectedRevenue, 0);
    const consolidatedExpectedCOGS = projected.reduce((acc, x) => acc + x.expectedCOGS, 0);
    const consolidatedExpectedProfit = consolidatedExpectedRevenue - consolidatedExpectedCOGS;
    const expectedFoodCostPercent = consolidatedExpectedRevenue > 0 
      ? (consolidatedExpectedCOGS / consolidatedExpectedRevenue) * 100 
      : 0;

    // 5. Generate Scoring Ecosystem (Scale 0-100)
    
    // Financial Health Score:
    // Base is 100. Lowered by food cost percentages high, increased by strong margin targets
    let financialHealthScore = 100;
    const fPercent = expectedFoodCostPercent;
    if (fPercent > 40) financialHealthScore -= 30;
    else if (fPercent > 30) financialHealthScore -= (fPercent - 30) * 3;
    else financialHealthScore += (30 - fPercent) * 0.5; // marginal points for ultra-efficient COGS

    if (consolidatedExpectedRevenue <= 0) financialHealthScore = 0;
    financialHealthScore = Math.min(100, Math.max(0, Math.round(financialHealthScore)));

    // Profitability Score:
    // Based on average gross margin % and percentage of items carrying positive margins
    let profitabilityScore = 0;
    if (projected.length > 0) {
      const positiveMarginRatio = projected.filter(x => x.expectedProfit > 0).length / projected.length;
      const rawAvgMargin = consolidatedExpectedRevenue > 0 ? (consolidatedExpectedProfit / consolidatedExpectedRevenue) * 100 : 0;
      profitabilityScore = (positiveMarginRatio * 60) + (Math.min(40, (rawAvgMargin / 40) * 40));
    }
    profitabilityScore = Math.min(100, Math.max(0, Math.round(profitabilityScore)));

    // Operational Integrity Score:
    // Determined by how cleanly ledger postings and order snapshot states are synchronized.
    let operationalIntegrityScore = 100;
    if (reconciliationReport) {
      // Deduct points for failed postings and stranded listings
      operationalIntegrityScore -= (reconciliationReport.failedPostings * 10);
      const findingsCount = reconciliationReport.findings ? reconciliationReport.findings.length : 0;
      operationalIntegrityScore -= (findingsCount * 2);
    }
    operationalIntegrityScore = Math.min(100, Math.max(0, Math.round(operationalIntegrityScore)));

    // Inventory Integrity Score:
    // Derived directly from the reconciliation score or custom discrepancies
    let inventoryIntegrityScore = 100;
    if (reconciliationReport) {
      inventoryIntegrityScore = reconciliationReport.reconciliationScore;
    }
    inventoryIntegrityScore = Math.min(100, Math.max(0, Math.round(inventoryIntegrityScore)));

    // Growth Score:
    // Evaluates historical revenue change from prevMonthlyCogs and incorporates scenario growth modifiers
    let growthScore = 70; // baseline neutral
    if (monthlyCogs && prevMonthlyCogs && prevMonthlyCogs.totalRevenue > 0) {
      const histGrowth = ((monthlyCogs.totalRevenue - prevMonthlyCogs.totalRevenue) / prevMonthlyCogs.totalRevenue) * 100;
      growthScore += histGrowth * 2;
    }
    // overlay current scenario order rate
    growthScore += (params.orderGrowthRate * 1.5);
    growthScore = Math.min(100, Math.max(0, Math.round(growthScore)));

    // Overall Business Score:
    // Weighted average of all functional core scorecards:
    // 30% Financial Health, 25% Profitability, 15% Operational, 15% Inventory, 15% Growth
    const overallBusinessScore = Math.round(
      (financialHealthScore * 0.3) +
      (profitabilityScore * 0.25) +
      (operationalIntegrityScore * 0.15) +
      (inventoryIntegrityScore * 0.15) +
      (growthScore * 0.15)
    );

    return {
      topRevenueForecast,
      topProfitForecast,
      slowMovingForecast,
      marginRiskForecast,
      financialHealthScore,
      profitabilityScore,
      operationalIntegrityScore,
      inventoryIntegrityScore,
      growthScore,
      overallBusinessScore,
      consolidatedExpectedRevenue: Math.round(consolidatedExpectedRevenue * 100) / 100,
      consolidatedExpectedCOGS: Math.round(consolidatedExpectedCOGS * 100) / 100,
      consolidatedExpectedProfit: Math.round(consolidatedExpectedProfit * 100) / 100,
      expectedFoodCostPercent: Math.round(expectedFoodCostPercent * 10) / 10
    };
  }
}
