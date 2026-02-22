const { Connection, Keypair, Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const path = require('path');
const fs = require('fs');

async function sendVaried() {
    // 1. Load .env from the same folder as this script
    require('dotenv').config({ path: path.resolve(__dirname, '.env') });
    
    const secretString = process.env.NOTARY_SECRET;
    if (!secretString) {
        throw new Error("❌ ERROR: NOTARY_SECRET is still missing from .env");
    }

    const connection = new Connection(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com", "confirmed");
    const target = new PublicKey("2XZ4miE9hkxq24oycRhBNgoSepRDEk8QdmnHo1QSz3q8");

    const secretKey = Uint8Array.from(secretString.replace(/[\[\]\s]/g, '').split(',').map(Number));
    const mainWallet = Keypair.fromSecretKey(secretKey);

    // 2. Varied amounts to trigger Gini Variance
    const amounts = [0.08, 0.03, 0.15]; 
    console.log(`📡 Sending behavioral patterns from ${mainWallet.publicKey.toBase58()}...`);

    for (let i = 0; i < amounts.length; i++) {
        const { blockhash } = await connection.getLatestBlockhash();
        const transaction = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: mainWallet.publicKey,
                toPubkey: target,
                lamports: Math.floor(amounts[i] * LAMPORTS_PER_SOL),
            })
        );

        const signature = await connection.sendTransaction(transaction, [mainWallet]);
        await connection.confirmTransaction(signature);
        console.log(`[${i+1}/3] ✅ Pattern ${i+1} Set: ${amounts[i]} SOL`);
        
        await new Promise(r => setTimeout(r, 2000)); 
    }
    console.log("\n✨ Distribution established. The Gini Engine now has data variance.");
}

sendVaried().catch(console.error);
