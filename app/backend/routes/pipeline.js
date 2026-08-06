import express from 'express'

const router = express.Router()

router.get('/findings', async (req, res) => {
    try {
        // TEMP MOCK DATA (replace later with real scan parsing)
        const findings = {
            critical: 2,
            high: 5,
            medium: 8,
            low: 3
        }

        const total =
            findings.critical +
            findings.high +
            findings.medium +
            findings.low

        res.json({
            ...findings,
            total
        })

    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Failed to load pipeline findings' })
    }
})

export default router
