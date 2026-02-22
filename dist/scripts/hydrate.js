"use strict";
const path = require('path');
const fs = require('fs');
// 1. Sovereign Environment Resolution
const envPaths = [
    path.resolve(__dirname, '../.env.local'),
    path.resolve(__dirname, '../.env')
];
let envLoaded = false;
for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
        require('dotenv').config({ path: envPath });
        console.log(`📡 [SENTINEL] Hydration Env: ${path.basename(envPath)}`);
        envLoaded = true;
        break;
    }
}
const { Connection, Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
async function hydrate() {
    console.log("🌊 Starting TrustChain High-Inequality Hydration...");
    const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");
    // 2. Setup Logging Path
    const logDir = "/home/freedomwithin/Documents/Tech/1_GitHub_Reops/TrustChain_documentation/Wallets-Testing";
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFileName = `demo_cluster_${timestamp}.json`;
    const logPath = path.join(logDir, logFileName);
    if (!fs.existsSync(logDir))
        fs.mkdirSync(logDir, { recursive: true });
    // 3. Load Notary
    const secretString = process.env.NOTARY_SECRET;
    if (!secretString)
        throw new Error("NOTARY_SECRET not found in environment.");
    const secretKey = Uint8Array.from(secretString.replace(/[\[\]]/g, '').split(',').map(Number));
    const notary = Keypair.fromSecretKey(secretKey);
    console.log(`🏛️ Using Identity: ${notary.publicKey.toBase58()}`);
    // 4. Scenario Config
    const txCount = 3;
    const whaleAmount = 0.3; // The "Anomaly"
    const dustAmount = 0.01; // The "Noise"
    const clusterLog = [];
    for (let i = 0; i < txCount; i++) {
        const isWhale = i === 0;
        const amount = isWhale ? whaleAmount : dustAmount;
        const burnerKeypair = Keypair.generate();
        const target = burnerKeypair.publicKey;
        clusterLog.push({
            role: isWhale ? 'WHALE' : 'dust',
            address: target.toBase58(),
            secretKey: Array.from(burnerKeypair.secretKey)
        });
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        const transaction = new Transaction({
            feePayer: notary.publicKey,
            recentBlockhash: blockhash
        }).add(SystemProgram.transfer({
            fromPubkey: notary.publicKey,
            toPubkey: target,
            lamports: Math.floor(amount * LAMPORTS_PER_SOL),
        }));
        try {
            const signature = await connection.sendTransaction(transaction, [notary]);
            await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
            console.log(`[${i + 1}/${txCount}] ✅ ${isWhale ? 'WHALE' : 'dust'} sent: ${amount} SOL`);
            if (i < txCount - 1) {
                console.log("⏳ Sleeping 10s for temporal entropy...");
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }
        catch (err) {
            console.error(`❌ Failed on tx ${i + 1}:`, err.message);
        }
    }
    fs.writeFileSync(logPath, JSON.stringify(clusterLog, null, 2));
    console.log("\n----------------------------------------------------");
    console.log("✨ Hydration Complete. Gini/HHI scores live on-chain.");
    console.log("----------------------------------------------------");
}
hydrate().catch(console.error);
