import * as path from "path";
import * as fs from "fs";
import * as dotenv from "dotenv";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import * as anchor from '@coral-xyz/anchor';
const { Program, AnchorProvider, Wallet } = anchor;
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IDL = require('./idl/trustchain_notary.json');

// @ts-ignore
import { calculateGini, calculateHHI } from './integrityEngine.js';
// @ts-ignore
import { fetchWithRetry } from './utils/rpc.js';

const envPaths = [
    path.resolve(__dirname, ".env.local"),
    path.resolve(__dirname, ".env"),
];

let envLoaded = false;
for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
        console.log(`📡 [SENTINEL] Environment Loaded: ${path.basename(envPath)}`);
        envLoaded = true;
        break;
    }
}

if (!envLoaded) {
    console.warn("⚠️ WARNING: No .env found. Using Vercel environment variables.");
}

const secretString = process.env.NOTARY_SECRET || "";
let NOTARY_KEYPAIR: Keypair | null = null;
try {
    const cleanString = secretString.replace(/[\[\]"\s]/g, '');
    const secretBytes = Uint8Array.from(cleanString.split(',').map(Number));
    NOTARY_KEYPAIR = Keypair.fromSecretKey(secretBytes);
} catch (e) {
    console.error("❌ ERROR: Could not parse NOTARY_SECRET.", e);
}

const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const connection = new Connection(rpcUrl, "confirmed");

const PROGRAM_ID = new PublicKey(
    process.env.SOLANA_PROGRAM_ID || "CvEK7knkMGSE4jw9HxNjHndxdChKW6XAxN4wThk3dkLT"
);

const TARGET_WALLET = new PublicKey(
    process.env.TARGET_WALLET_ADDRESS || "JCq7a2E3r4M3aA2xQm4uXpKdV1FBocWLqUqgjLG81Xcg"
);

const fetchWalletData = async (address: string) => {
    const pubKey = new PublicKey(address);
    const signatures = await fetchWithRetry(() =>
        connection.getSignaturesForAddress(pubKey, { limit: 15 })
    );
    const transactions: any[] = [];
    const positions: any[] = [];

    console.log(`🔍 Analyzing ${signatures.length} signatures for ${address}...`);

    for (const sigInfo of signatures) {
        try {
            await new Promise(r => setTimeout(r, 200));
            const tx = await fetchWithRetry(() =>
                connection.getParsedTransaction(sigInfo.signature, {
                    maxSupportedTransactionVersion: 0
                })
            );
            if (!tx || !tx.meta) continue;

            const accountIndex = tx.transaction.message.accountKeys.findIndex(
                (key: any) => key.pubkey.toBase58() === address
            );
            if (accountIndex !== -1) {
                const amount = Math.abs(
                    (tx.meta.preBalances[accountIndex] || 0) -
                    (tx.meta.postBalances[accountIndex] || 0)
                );
                transactions.push({ amount });
                positions.push({ value: amount });
            }
        } catch (err) { continue; }
    }
    return { transactions, positions };
};

export default async function handler(req: any, res: any) {
    // Guard: fail clearly instead of crashing silently
    if (!NOTARY_KEYPAIR) {
        return res.status(500).json({
            error: "NOTARY_SECRET is missing or invalid. Check Vercel environment variables."
        });
    }

    try {
        console.log(`🏛️ Notary Signer: ${NOTARY_KEYPAIR.publicKey.toBase58()}`);
        console.log(`🎯 Target: ${TARGET_WALLET.toBase58()}`);

        const rawData = await fetchWalletData(TARGET_WALLET.toBase58());
        const gini = calculateGini(rawData.transactions);
        const hhi = calculateHHI(rawData.positions);

        const giniScore = Math.min(Math.floor(gini * 10000), 65535);
        const hhiScore = Math.min(Math.floor(hhi * 10000), 65535);
        const status = gini > 0.9 ? 2 : (gini < 0.3 ? 0 : 1);

        const wallet = new Wallet(NOTARY_KEYPAIR);
        const provider = new AnchorProvider(connection, wallet, {
            preflightCommitment: "confirmed"
        });
        const program = new Program(IDL, PROGRAM_ID, provider);

        const [userIntegrityPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("notary"), TARGET_WALLET.toBuffer()],
            PROGRAM_ID
        );

        console.log(`🔐 PDA: ${userIntegrityPda.toBase58()}`);

        const tx = await program.methods
            .updateIntegrity(giniScore, hhiScore, status)
            .accounts({
                notaryAccount: userIntegrityPda,
                notary: NOTARY_KEYPAIR.publicKey,
                targetUser: TARGET_WALLET,
                systemProgram: SystemProgram.programId,
            })
            .signers([NOTARY_KEYPAIR])
            .rpc();

        return res.status(200).json({
            success: true,
            signature: tx,
            scores: { gini, hhi, status }
        });

    } catch (error: any) {
        console.error("❌ Sync Failed:", error);
        return res.status(500).json({ error: error.message });
    }
}