import { getVerificationData } from '../server';
import { calculateVoterWeight } from '../integrityEngine';
import * as dotenv from 'dotenv';

dotenv.config();

console.log("Successfully imported modules via extensionless imports.");

async function main() {
    // Basic verification of imported functions
    if (typeof getVerificationData !== 'function') {
        throw new Error("getVerificationData import failed");
    }
    if (typeof calculateVoterWeight !== 'function') {
        throw new Error("calculateVoterWeight import failed");
    }

    console.log("Verification complete: Imports resolved correctly.");
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
