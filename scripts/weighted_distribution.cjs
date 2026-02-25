const { Connection, Keypair, Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const path = require('path');
const fs = require('fs');

async function sendWeighted() {
    // 1. Load .env from the same folder as this script
    require('dotenv').config({ path: path.resolve(__dirname, '.env') });

    const secretString = process.env.NOTARY_SECRET;
    if (!secretString) {
        throw new Error("❌ ERROR: NOTARY_SECRET is still missing from .env");
    }

    const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
    console.log(`📡 Connecting to RPC: ${rpcUrl}`);
    const connection = new Connection(rpcUrl, "confirmed");

    const targetAddress = process.argv[2];
    if (!targetAddress) {
        console.error("❌ ERROR: Target wallet address must be provided as an argument.");
        process.exit(1);
    }

    let target;
    try {
        target = new PublicKey(targetAddress);
    } catch (e) {
        console.error("❌ ERROR: Invalid target wallet address.");
        process.exit(1);
    }

    const secretKey = Uint8Array.from(secretString.replace(/[\[\]\s]/g, '').split(',').map(Number));
    const mainWallet = Keypair.fromSecretKey(secretKey);

    // 2. Generate ~15 transactions with minimal variance
    // Base amount: 0.1 SOL
    // Variance: +/- 0.0005 SOL (to keep Gini extremely low)
    // Goal: HHI < 0.10, Gini ~ 0
    const count = 15;
    const baseAmount = 0.1;
    const amounts = [];

    console.log(`🧪 Generating ${count} transactions for organic weighted distribution...`);
    for (let i = 0; i < count; i++) {
        // Random variance between -0.0005 and +0.0005
        const variance = (Math.random() * 0.001) - 0.0005;
        const amount = baseAmount + variance;
        amounts.push(amount);
    }

    console.log(`📡 Sending behavioral patterns from ${mainWallet.publicKey.toBase58()} to ${targetAddress}...`);

    for (let i = 0; i < amounts.length; i++) {
        const lamports = Math.floor(amounts[i] * LAMPORTS_PER_SOL);
        const { blockhash } = await connection.getLatestBlockhash();

        const transaction = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: mainWallet.publicKey,
                toPubkey: target,
                lamports: lamports,
            })
        );

        try {
            const signature = await connection.sendTransaction(transaction, [mainWallet]);
            await connection.confirmTransaction(signature);
            console.log(`[${i+1}/${count}] ✅ Transaction ${i+1} Sent: ${amounts[i].toFixed(6)} SOL (Sig: ${signature.slice(0, 8)}...)`);
        } catch (error) {
            console.error(`⚠️  Transaction ${i+1} failed: ${error.message}`);
        }

        // Small delay to simulate organic timing and avoid rate limits
        await new Promise(r => setTimeout(r, 1500));
    }
    console.log("\n✨ Weighted Distribution established. The Gini Engine now has low-variance data.");
}

sendWeighted().catch(console.error);
