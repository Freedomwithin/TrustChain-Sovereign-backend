import axios from 'axios';

/**
 * TrustChain Reputation Engine
 * Fetches external reputation data and combines with local integrity metrics.
 */

// Default score if FairScale API is unreachable or returns 404
const DEFAULT_FAIR_SCORE = 50;

/**
 * Fetches the FairScore for a given wallet address.
 * @param {string} address - The wallet address.
 * @returns {Promise<number>} - The FairScore (0-100).
 */
export const getFairScore = async (address) => {
  try {
    const response = await axios.get(`https://sales.fairscale.xyz/api/score/${address}`, {
      timeout: 3000 // 3s timeout to avoid blocking verification
    });

    if (response.data && typeof response.data.score === 'number') {
      let score = response.data.score;
      // Normalize if score is 0-1 (heuristic)
      if (score <= 1 && score > 0) {
        score = score * 100;
      }
      return Math.min(Math.max(score, 0), 100);
    }

    // Fallback if structure is different
    console.warn(`[ReputationEngine] Unexpected response format for ${address}:`, response.data);
    return DEFAULT_FAIR_SCORE;

  } catch (error) {
    // 404 is expected for new wallets
    if (error.response && error.response.status === 404) {
      return DEFAULT_FAIR_SCORE;
    }
    console.warn(`[ReputationEngine] Failed to fetch FairScore for ${address}:`, error.message);
    return DEFAULT_FAIR_SCORE;
  }
};

/**
 * Calculates the Total Reputation Score based on weighted logic.
 * Formula: (TrustChainBehavioral * 0.7) + (FairScaleSocial * 0.3)
 * @param {number} trustChainScore - Derived from local integrity (0-100).
 * @param {number} fairScore - Fetched from FairScale (0-100).
 * @returns {number} - The weighted total score (0-100).
 */
export const calculateTotalScore = (trustChainScore, fairScore) => {
  const weightedTrust = trustChainScore * 0.7;
  const weightedFair = fairScore * 0.3;
  return Math.round(weightedTrust + weightedFair);
};
