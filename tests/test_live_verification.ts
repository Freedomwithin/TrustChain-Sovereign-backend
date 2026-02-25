import { getVerificationData } from '../server.js'; // Ensure .js extension for imports
import { calculateVoterWeight } from '../integrityEngine.js';

const TEST_WALLET = "GAZDwoHW6x4QCaWXizhckqta6v7nFYEFg2aULTk52k7b";

async function runTest() {
    console.log(`Running verification for wallet: ${TEST_WALLET}`);

    try {
        const result = await getVerificationData(TEST_WALLET);
        console.log("Verification Data:", JSON.stringify(result, null, 2));

        const weightMultiplier = calculateVoterWeight(result.totalScore, result.hhi);
        console.log("Voter Weight Multiplier:", weightMultiplier);

        if (result.gini === 0 && result.status === 'PROBATIONARY') {
            console.log("\n⚠️  Issue Detected: Gini is 0 but status is PROBATIONARY.");
            console.log("TrustChain Score:", result.trustChainScore); // (1 - 0) * 100 = 100
            console.log("Total Score:", result.totalScore);
            // If Total Score is high, calculateVoterWeight will be high.
        }

    } catch (error) {
        console.error("Error during verification:", error);
    }
}

runTest();
