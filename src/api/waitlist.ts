import { Router } from 'express';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

const router = Router();
const dbPath = path.resolve(process.cwd(), 'data/waitlist.db');

// --- Initialize Sovereign Waitlist Ledger ---
async function initDb() {
    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });
    await db.exec(`
        CREATE TABLE IF NOT EXISTS waitlist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            product TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    return db;
}

router.post('/signup', async (req, res) => {
    const { email, product } = req.body;
    
    if (!email || !product) {
        return res.status(400).json({ error: 'Email and product type required.' });
    }

    try {
        const db = await initDb();
        await db.run(
            'INSERT INTO waitlist (email, product) VALUES (?, ?)',
            [email, product]
        );
        console.log(`[Waitlist] New lead: ${email} for ${product}`);
        res.json({ success: true, message: 'You are on the list, sovereign.' });
    } catch (e: any) {
        if (e.code === 'SQLITE_CONSTRAINT') {
            return res.json({ success: true, message: 'Already registered.' });
        }
        console.error('[Waitlist] Error:', e);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

export { router as waitlistRouter };
