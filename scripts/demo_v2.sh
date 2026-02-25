#!/bin/bash
# TrustChain Sovereign: Institutional Demo Sequence V2 (Targeted)
cd "$(dirname "$0")"

# --- 1. SET THE BASE DIRECTORY ---
BACKEND_DIR=$(cd ".." && pwd)
SCRIPTS_DIR=$(pwd)

# --- 2. SET THE TARGETS ---
# Explicitly setting the Demo-Final wallet for this run
export TARGET_WALLET_ADDRESS="GAZDwoHW6x4QCaWXizhckqta6v7nFYEFg2aULTk52k7b"
export NOTARY_PK="JCq7a2E3r4M3aA2xQm4uXpKdV1FBocWLqUqgjLG81Xcg"

# --- 3. SET THE PATHS ---
export PATH="/home/freedomwithin/.local/share/solana/install/active_release/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use v25.6.0 > /dev/null

alert_user() {
    paplay /usr/share/sounds/freedesktop/stereo/complete.oga 2>/dev/null || echo -e "\a"
}

echo "🎥 Starting Demo V2 for $TARGET_WALLET_ADDRESS in 10 seconds..."
alert_user
sleep 10

# --- 4. THE "WAKE UP" ---
echo "🛰️  Step 1: Pinging Ledger (Notary Airdrop)..."
# Funding the Notary that will handle the hydration and notarization
solana airdrop 1.5 $NOTARY_PK --url devnet > /dev/null 2>&1
alert_user
sleep 10

# --- 5. THE HYDRATION ---
echo "🛡️  Step 2: Simulating Behavioral Cluster (Whale vs. Dust) for Target..."
# Passing the target address directly to the hydration script
TARGET_WALLET_ADDRESS=$TARGET_WALLET_ADDRESS node "$SCRIPTS_DIR/hydrate.js"
alert_user 
sleep 10 

# --- 6. FINAL NOTARY STEP ---
echo "🏛️  Step 3: Notarizing Integrity Scores to PDA..."
# Ensuring the notarization syncs the scores for the correct wallet
TARGET_WALLET_ADDRESS=$TARGET_WALLET_ADDRESS yarn workspace trustchain-backend tsx services/notary_sync.ts

alert_user 

echo "----------------------------------------------------"
echo "✨ Demo Sequence Complete. GAZD Results Locked on Devnet."
echo "----------------------------------------------------"

exec $SHELL
