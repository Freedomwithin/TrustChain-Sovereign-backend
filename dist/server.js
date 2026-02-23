import * as path from "path";
import * as fs from "fs";
import * as dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { performance } from "perf_hooks";
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
import { getFairScore, calculateTotalScore } from './services/reputationEngine.js';
// @ts-ignore
import { fetchWithRetry } from './utils/rpc.js';
dotenv.config();
// ---- Environment ----
// Prioritize existing environment variables to support Edge/Serverless runtimes
if (!process.env.NOTARY_SECRET) {
    const envPaths = [
        path.resolve(__dirname, ".env.local"),
        path.resolve(__dirname, ".env"),
    ];
    for (const envPath of envPaths) {
        if (fs.existsSync && fs.existsSync(envPath)) {
            dotenv.config({ path: envPath });
            break;
        }
    }
}
// ---- Notary Keypair ----
let NOTARY_KEYPAIR = null;
try {
    const secretString = process.env.NOTARY_SECRET || "";
    const cleanString = secretString.replace(/[\[\]"\s]/g, '');
    const secretBytes = Uint8Array.from(cleanString.split(',').map(Number));
    NOTARY_KEYPAIR = Keypair.fromSecretKey(secretBytes);
}
catch (e) {
    console.error("ERROR: Could not parse NOTARY_SECRET.");
}
// ---- Connection ----
const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const connection = new Connection(rpcUrl, "confirmed");
const PROGRAM_ID = new PublicKey(process.env.SOLANA_PROGRAM_ID || "CvEK7knkMGSE4jw9HxNjHndxdChKW6XAxN4wThk3dkLT");
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const validateAddress = (address) => {
    if (!address || typeof address !== 'string')
        return false;
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
};
const fetchWalletData = async (address) => {
    const pubKey = new PublicKey(address);
    const signatures = await fetchWithRetry(() => connection.getSignaturesForAddress(pubKey, { limit: 20 }));
    const transactions = [];
    const positions = [];
    const timestamps = [];
    for (const sigInfo of signatures) {
        try {
            await delay(500);
            const tx = await fetchWithRetry(() => connection.getParsedTransaction(sigInfo.signature, {
                maxSupportedTransactionVersion: 0
            }));
            if (!tx || !tx.meta)
                continue;
            if (sigInfo.blockTime)
                timestamps.push(sigInfo.blockTime);
            const accountIndex = tx.transaction.message.accountKeys.findIndex((key) => key.pubkey.toBase58() === address);
            if (accountIndex !== -1) {
                const amount = Math.abs((tx.meta.preBalances[accountIndex] || 0) -
                    (tx.meta.postBalances[accountIndex] || 0));
                if (amount > 0) {
                    transactions.push(amount);
                    positions.push(amount);
                }
            }
        }
        catch (err) {
            continue;
        }
    }
    return { transactions, positions, timestamps, signatures };
};
// ---- Express App ----
const app = express();
app.use(cors({
    origin: [
        process.env.CORS_ORIGIN || '',
        'https://trustchain-sovereign-frontend.vercel.app',
        /\.vercel\.app$/,
        'http://localhost:5173'
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
// ---- Routes ----
app.get('/', (req, res) => {
    const publicIndex = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(publicIndex)) {
        return res.sendFile(publicIndex);
    }
    return res.json({
        status: 'SENTINEL ACTIVE',
        notary: NOTARY_KEYPAIR?.publicKey.toBase58() || 'NOT CONFIGURED',
        rpc: rpcUrl,
        program: PROGRAM_ID.toBase58()
    });
});
// Pool integrity — static data + live notary balance
// Polls every 5 minutes from frontend, not on every request
app.get('/api/pool/:id/integrity', async (req, res) => {
    const poolId = req.params.id;
    try {
        const baseData = {
            'SOL-USDC': { giniScore: 0.15, topHolders: 12, totalLiquidity: 5000000 },
            'JUP-SOL': { giniScore: 0.22, topHolders: 8, totalLiquidity: 1200000 },
            'RAY-SOL': { giniScore: 0.35, topHolders: 5, totalLiquidity: 300000 }
        };
        const notaryAddr = NOTARY_KEYPAIR?.publicKey.toBase58()
            || process.env.NOTARY_PUBLIC_KEY
            || 'FBbjMhKtg1iyy83CeHaieqEFqw586i3WYG4zCcnXr7tc';
        const balance = await connection.getBalance(new PublicKey(notaryAddr));
        const solBalance = balance / 1e9;
        return res.json({
            ...(baseData[poolId] || baseData['SOL-USDC']),
            notaryBalance: solBalance,
            status: solBalance >= 0.05 ? 'ONLINE' : 'LOW_FUNDS',
            lastSync: new Date().toISOString()
        });
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to fetch pool state' });
    }
});
// Wallet verification + on-chain notarization
app.post('/api/verify', async (req, res) => {
    const { address } = req.body;
    const start = performance.now();
    if (!validateAddress(address)) {
        return res.status(400).json({ status: 'INVALID_ADDRESS' });
    }
    if (!NOTARY_KEYPAIR) {
        return res.status(500).json({
            error: 'NOTARY_SECRET not configured',
            status: 'OFFLINE'
        });
    }
    try {
        const data = await fetchWalletData(address);
        const gini = calculateGini(data.transactions);
        const hhi = calculateHHI(data.positions);
        const giniScore = Math.min(Math.floor(gini * 10000), 65535);
        const hhiScore = Math.min(Math.floor(hhi * 10000), 65535);
        const txCount = data.signatures.length;
        // Status logic
        let status;
        if (txCount < 3) {
            status = 'PROBATIONARY';
        }
        else if (gini > 0.9) {
            status = 'SYBIL';
        }
        else if (gini < 0.3) {
            status = 'VERIFIED';
        }
        else {
            status = 'PROBATIONARY';
        }
        const statusNum = status === 'VERIFIED' ? 0 : status === 'PROBATIONARY' ? 1 : 2;
        // Weighted Logic Integration
        const fairScore = await getFairScore(address);
        // TrustChain Score: (1 - Gini) * 100
        const trustChainScore = Math.max(0, Math.round((1 - Math.min(gini, 1)) * 100));
        const totalScore = calculateTotalScore(trustChainScore, fairScore);
        // On-chain notarization
        let signature = null;
        try {
            const wallet = new Wallet(NOTARY_KEYPAIR);
            const provider = new AnchorProvider(connection, wallet, {
                preflightCommitment: "confirmed"
            });
            const program = new Program(IDL, PROGRAM_ID, provider);
            const targetPubkey = new PublicKey(address);
            const [userIntegrityPda] = PublicKey.findProgramAddressSync([Buffer.from("notary"), targetPubkey.toBuffer()], PROGRAM_ID);
            signature = await program.methods
                .updateIntegrity(giniScore, hhiScore, statusNum)
                .accounts({
                notaryAccount: userIntegrityPda,
                notary: NOTARY_KEYPAIR.publicKey,
                targetUser: targetPubkey,
                systemProgram: SystemProgram.programId,
            })
                .signers([NOTARY_KEYPAIR])
                .rpc();
            console.log(`Notarized ${address}: ${signature}`);
        }
        catch (notaryErr) {
            // Don't fail the whole request if notarization fails
            console.warn(`Notarization skipped: ${notaryErr.message}`);
        }
        const end = performance.now();
        return res.json({
            status,
            scores: {
                gini,
                hhi,
                syncIndex: 0,
                totalScore,
                fairScore,
                trustChainScore
            },
            txCount,
            signature,
            latencyMs: Math.round(end - start)
        });
    }
    catch (error) {
        console.error("Verification error:", error);
        return res.json({
            status: 'OFFLINE',
            scores: { gini: 0, hhi: 0, syncIndex: 0 }
        });
    }
});
export default app;
