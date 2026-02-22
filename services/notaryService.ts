import { Connection, Keypair, PublicKey, SystemProgram, ParsedTransactionWithMeta, ConfirmedSignatureInfo } from "@solana/web3.js";
import * as anchor from '@coral-xyz/anchor';
const { Program, AnchorProvider, Wallet } = anchor;
import { calculateGini, calculateHHI } from './integrityEngine.js';
import { fetchWithRetry } from '../utils/rpc.js';

// --- Constants ---
const HISTORY_LIMIT = 15;
const SCALING_FACTOR = 10000;
const U16_MAX = 65535;
const GINI_HIGH_THRESHOLD = 0.9;
const GINI_LOW_THRESHOLD = 0.3;

// --- Interfaces ---
interface TransactionData {
    amount: number;
}

interface PositionData {
    value: number;
}

interface WalletData {
    transactions: TransactionData[];
    positions: PositionData[];
}

interface NotaryResult {
    signature: string;
    gini: string;
    hhi: string;
    pda: string;
}

/**
 * TrustChain Dynamic Notary
 * Takes any wallet address and notarizes behavioral integrity scores.
 */
export const notarizeWallet = async (targetWalletAddress: string): Promise<NotaryResult> => {
    // 1. Setup Environment from Process
    const rpcUrl = process.env.SOLANA_RPC_URL;
    const programIdStr = process.env.TRUSTCHAIN_PROGRAM_ID;
    const secretStr = process.env.NOTARY_SECRET;

    if (!rpcUrl) throw new Error("Missing SOLANA_RPC_URL environment variable");
    if (!programIdStr) throw new Error("Missing TRUSTCHAIN_PROGRAM_ID environment variable");
    if (!secretStr) throw new Error("Missing NOTARY_SECRET environment variable");

    const connection = new Connection(rpcUrl, "confirmed");
    const PROGRAM_ID = new PublicKey(programIdStr);

    // 2. Initialize Notary (The Authority)
    let secretBytes: Uint8Array;
    try {
        secretBytes = Uint8Array.from(JSON.parse(secretStr));
    } catch (e) {
        throw new Error("Invalid NOTARY_SECRET format. Expected JSON array.");
    }
    const NOTARY_KEYPAIR = Keypair.fromSecretKey(secretBytes);

    let TARGET_WALLET: PublicKey;
    try {
        TARGET_WALLET = new PublicKey(targetWalletAddress);
    } catch (e) {
         throw new Error("Invalid target wallet address.");
    }

    // 3. Data Acquisition
    const fetchWalletData = async (address: string): Promise<WalletData> => {
        const pubKey = new PublicKey(address);
        const signatures: ConfirmedSignatureInfo[] = await fetchWithRetry(() => connection.getSignaturesForAddress(pubKey, { limit: HISTORY_LIMIT }));
        const transactions: TransactionData[] = [];
        const positions: PositionData[] = [];

        for (const sigInfo of signatures) {
            try {
                const tx: ParsedTransactionWithMeta | null = await fetchWithRetry(() => connection.getParsedTransaction(sigInfo.signature, { maxSupportedTransactionVersion: 0 }));
                if (!tx || !tx.meta) continue;

                // Using 'any' cast here as ParsedMessage AccountKeys are complex union types, but we need simple access
                // to find the index.
                const accountKeys: any[] = tx.transaction.message.accountKeys;
                const accountIndex = accountKeys.findIndex((key: any) => key.pubkey.toBase58() === address);

                if (accountIndex !== -1) {
                    const pre = tx.meta.preBalances[accountIndex] || 0;
                    const post = tx.meta.postBalances[accountIndex] || 0;
                    const amount = Math.abs(pre - post);
                    transactions.push({ amount });
                    positions.push({ value: amount });
                }
            } catch (err) { continue; }
        }
        return { transactions, positions };
    };

    // 4. Analysis & Execution
    const rawData = await fetchWalletData(targetWalletAddress);
    const gini = calculateGini(rawData.transactions);
    const hhi = calculateHHI(rawData.positions);

    // Scaling scores for u16 on-chain storage
    const giniScore = Math.min(Math.floor(gini * SCALING_FACTOR), U16_MAX);
    const hhiScore = Math.min(Math.floor(hhi * SCALING_FACTOR), U16_MAX);
    const status = gini > GINI_HIGH_THRESHOLD ? 2 : (gini < GINI_LOW_THRESHOLD ? 0 : 1);

    // 5. Anchor Instruction
    const wallet = new Wallet(NOTARY_KEYPAIR);
    const provider = new AnchorProvider(connection, wallet, { preflightCommitment: "confirmed" });

    // We type IDL as 'any' because fetching it at runtime yields a JSON object
    // that Anchor converts internally. In a strict setup, we would import the IDL type definition.
    const IDL: any = (await anchor.Program.fetchIdl(PROGRAM_ID, provider));
    if (!IDL) throw new Error("Could not fetch IDL for program.");

    const program = new Program(IDL, PROGRAM_ID, provider);

    const [userIntegrityPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("notary"), TARGET_WALLET.toBuffer()],
        PROGRAM_ID
    );

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

    return {
        signature: tx,
        gini: gini.toFixed(4),
        hhi: hhi.toFixed(4),
        pda: userIntegrityPda.toBase58()
    };
};
