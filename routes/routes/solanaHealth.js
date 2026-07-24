const express = require('express');
const router = express.Router();
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { Program, AnchorProvider, Wallet } = require('@coral-xyz/anchor');
const idl = require('../../idl/pace_health.json'); // Your compiled smart contract IDL file
const { getOrCreateUserWallet } = require('../../services/walletService');

const connection = new Connection("https://api.devnet.solana.com", "confirmed");

// Setup an admin/relayer wallet that pays for transactions on Devnet
const relayerKeypair = Keypair.generate(); // For production, load from an encrypted .env key array
const wallet = new Wallet(relayerKeypair);
const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

// Lazy initialize program to avoid issues with IDL at module load
let program = null;
function getProgram() {
    if (!program) {
        try {
            program = new Program(idl, provider);
        } catch (err) {
            console.warn("⚠️ Anchor Program initialization deferred (IDL may be incomplete for testing):", err.message);
            program = null; // Keep null to retry on next call
        }
    }
    return program;
}

// 1. Endpoint: Receive posture event from ESP32, submit to Blockchain
router.post('/api/posture-event', async (req, res) => {
    const { userId, eventType, postureScore, durationSecs } = req.body;

    try {
        // Resolve or create user's public address string
        const userWalletAddress = await getOrCreateUserWallet(userId);
        const userPublicKey = new PublicKey(userWalletAddress);

        // Derive the Program Derived Address (PDA) for this specific user
        const [userLedgerPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("pace-ledger"), userPublicKey.toBuffer()],
            program.programId
        );

        // Call the smart contract log_health_event method
        const txHash = await program.methods
            .logHealthEvent(eventType, postureScore, durationSecs)
            .accounts({
                userLedger: userLedgerPda,
                authority: relayerKeypair.publicKey,
                user: userPublicKey,
            })
            .signers([relayerKeypair])
            .rpc();

        return res.status(200).json({
            success: true,
            txHash: txHash,
            storedPublicKey: userWalletAddress
        });

    } catch (error) {
        console.error("Failed to commit health event to Solana:", error);
        return res.status(500).json({ error: "Blockchain write transaction failed." });
    }
});

// 2. Endpoint: Fetch a user's on-chain history for the Flutter app
router.get('/api/health-records/:walletAddress', async (req, res) => {
    const { walletAddress } = req.params;

    try {
        const userPublicKey = new PublicKey(walletAddress);
        const [userLedgerPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("pace-ledger"), userPublicKey.toBuffer()],
            program.programId
        );

        // Fetch account data straight from the Solana validator state
        const ledgerAccount = await program.account.userLedger.fetch(userLedgerPda);

        // Map data arrays cleanly so Flutter can render them instantly into a timeline list
        const formattedTimeline = ledgerAccount.history.map(event => ({
            eventType: event.eventType,
            postureScore: event.postureScore,
            durationSeconds: event.durationSecs.toString(),
            date: new Date(event.timestamp * 1000).toISOString()
        }));

        return res.status(200).json({
            success: true,
            walletAddress,
            totalEvents: ledgerAccount.eventCount,
            timeline: formattedTimeline
        });

    } catch (error) {
        console.error("Failed fetching on-chain data:", error);
        return res.status(500).json({ error: "Could not retrieve ledger records." });
    }
});

// 3. Endpoint: Public verifiable share link data
router.get('/api/verify-proof/:txHash', async (req, res) => {
    const { txHash } = req.params;
    try {
        const parsedTx = await connection.getTransaction(txHash, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
        if (!parsedTx) return res.status(404).json({ error: "Invalid transaction hash verification proof." });

        return res.status(200).json({
            verified: true,
            slot: parsedTx.slot,
            time: new Date(parsedTx.blockTime * 1000).toUTCString(),
            rawLogs: parsedTx.meta.logMessages
        });
    } catch (err) {
        return res.status(500).json({ error: "Failed to read hash state mapping from ledger." });
    }
});

// Initialize relayer wallet with airdrop if needed
(async () => {
    try {
        const balance = await connection.getBalance(relayerKeypair.publicKey);
        if (balance < 50000000) { // Less than 0.05 SOL
            console.log("⚠️ Relayer wallet running low! Requesting an airdrop...");
            await connection.requestAirdrop(relayerKeypair.publicKey, 1000000000); // Request 1 SOL
        }
    } catch (err) {
        console.error("Warning: Could not check/airdrop relayer wallet:", err);
    }
})();

module.exports = router;