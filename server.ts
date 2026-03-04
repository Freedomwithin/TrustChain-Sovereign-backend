import express from 'express';
import cors from 'cors';
import { Connection, PublicKey } from '@solana/web3.js';

const app = express();
app.use(cors());
app.use(express.json());

// --- SOVEREIGN ENGINE CONSTANTS ---
const PORT = process.env.PORT || 3001;
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const SYNC_INDEX_SYBIL_THRESHOLD = 0.8; // Coordinated bot activity threshold
const MIN_REQUIRED_TIMESTAMPS = 3;      // Minimum data points for temporal analysis
const TEMPORAL_WINDOW_MS = 3000;        // 3,000ms Sentinel Sync Window

const connection = new Connection(RPC_URL, 'confirmed');

/**
 * calculateSyncIndex: Detects "one-block" or highly synchronized bot swarms.
 * Implementation: Coefficient of Variation (CV) of inter-transaction arrival times.
 */
function calculateSyncIndex(timestamps: number[]): number {
  if (timestamps.length < MIN_REQUIRED_TIMESTAMPS) return 0;
  
  const intervals = [];
  for (let i = 1; i < timestamps.length; i++) {
    intervals.push(Math.abs(timestamps[i] - timestamps[i - 1]));
  }

  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  if (mean === 0) return 1.0; // Perfect synchronization (Instantaneous)

  const variance = intervals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / intervals.length;
  const stdDev = Math.sqrt(variance);
  
  // High CV = High Variance (Organic)
  // Low CV = Low Variance (Robotic/Synchronized)
  const cv = stdDev / mean;
  
  // We invert CV so that 1.0 = High Sync (Bot) and 0.0 = Low Sync (Human)
  return Math.max(0, 1 - cv);
}

/**
 * calculateGini: Measures asset/transaction concentration.
 */
function calculateGini(transactions: any[]): number {
  if (transactions.length < 2) return 0;
  const values = transactions.map(tx => tx.amount || 1).sort((a, b) => a - b);
  const n = values.length;
  let cumulativeSum = 0;
  for (let i = 1; i <= n; i++) {
    cumulativeSum += i * values[i - 1];
  }
  return (2 * cumulativeSum) / (n * values.reduce((a, b) => a + b, 0)) - (n + 1) / n;
}

app.post('/api/verify', async (req, res) => {
  const { address } = req.body;

  if (!address) {
    return res.status(400).json({ error: "Wallet address required" });
  }

  try {
    const pubKey = new PublicKey(address);
    const signatures = await connection.getSignaturesForAddress(pubKey, { limit: 20 });
    
    // Extract blockTimes for temporal analysis
    const timestamps = signatures
      .map(s => s.blockTime)
      .filter((t): t is number => t !== null && t !== undefined);

    const txCount = signatures.length;

    // --- BEHAVIORAL ANALYSIS ENGINE ---
    
    // 1. Calculate SyncIndex (Guard against NaN with MIN_REQUIRED_TIMESTAMPS)
    const syncIndex = timestamps.length >= MIN_REQUIRED_TIMESTAMPS 
      ? calculateSyncIndex(timestamps) 
      : 0;

    // 2. Calculate Gini (Concentration)
    const gini = calculateGini(signatures);

    /**
     * SOVEREIGN STATUS LOGIC
     * Prioritize Bot-Swarm Detection (SyncIndex) > Concentration (Gini)
     */
    let status: string;
    let reason: string;

    if (txCount < 3) {
      status = 'PROBATIONARY';
      reason = 'Insufficient transaction history for behavioral profiling.';
    } else if (syncIndex >= SYNC_INDEX_SYBIL_THRESHOLD) {
      status = 'SYBIL';
      reason = `Highly synchronized temporal patterns detected (Index: ${syncIndex.toFixed(2)}).`;
    } else if (gini > 0.9) {
      status = 'WARNING';
      reason = 'High transaction concentration detected.';
    } else {
      status = 'VERIFIED';
      reason = 'Organic behavioral patterns notarized.';
    }

    res.json({
      address,
      status,
      reason,
      scores: {
        gini: parseFloat(gini.toFixed(4)),
        syncIndex: parseFloat(syncIndex.toFixed(4)),
        txCount
      },
      metadata: {
        sentinelWindow: `${TEMPORAL_WINDOW_MS}ms`,
        notaryEra: "6QsE...xJ5",
        verifiedAt: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('Sentinel Error:', error);
    res.status(500).json({ error: "Sentinel failed to parse behavioral data", details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`TrustChain Sentinel Backend active on port ${PORT}`);
  console.log(`Sync Threshold: ${SYNC_INDEX_SYBIL_THRESHOLD} | Window: ${TEMPORAL_WINDOW_MS}ms`);
});
