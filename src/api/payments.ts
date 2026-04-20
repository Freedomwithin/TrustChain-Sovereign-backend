import { Router } from 'express';
import Stripe from 'stripe';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

router.post('/create-intent', async (req, res) => {
    const { tier, email, product_type } = req.body; // e.g., 'commander' or 'swarm-hub'
    
    if (!tier || !email || !product_type) {
        return res.status(400).json({ error: 'Tier, email, and product type required.' });
    }

    const priceMap: Record<string, number> = {
        'strategist': 4999,
        'commander': 12499,
        'sovereign': 24999,
        'pro-monthly': 50000,
        'pro-annual': 500000,
        'self-hosted': 500000
    };

    const amount = priceMap[tier];
    if (!amount) return res.status(400).json({ error: 'Invalid tier selected.' });

    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount,
            currency: 'usd',
            receipt_email: email,
            metadata: { 
                tier, 
                product_type,
                vault_access: 'pending'
            }
        });

        res.json({ clientSecret: paymentIntent.client_secret });
    } catch (e: any) {
        console.error('[Payments] Stripe error:', e);
        res.status(500).json({ error: e.message });
    }
});

export { router as paymentsRouter };
