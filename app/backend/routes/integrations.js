import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { getSetting } from './settings.js'
import db from '../database.js'

const router = Router()

// ----- GET /api/integrations/status -----
router.get('/status', requireAuth, async (req, res) => {
  const results = {}

  // GitHub — check token works
  try {
    const token = getSetting('github_token') || process.env.GITHUB_TOKEN
    const r = await fetch('https://api.github.com/user', {
      headers: { Authorization: `token ${token}`, 'User-Agent': 'ToolVault' }
    })
    results.github = { status: r.ok ? 'connected' : 'failed' }
  } catch {
    results.github = { status: 'failed' }
  }

  // DefectDojo — check API key works
  try {
    const url = getSetting('defectdojo_url') || process.env.DEFECTDOJO_URL
    const key = getSetting('defectdojo_api_key') || process.env.DEFECTDOJO_API_KEY
    if (!url || !key) throw new Error('Not configured')
    const r = await fetch(`${url}/api/v2/users/`, {
      headers: { Authorization: `Token ${key}` }
    })
    results.defectdojo = { status: r.ok ? 'connected' : 'failed' }
  } catch {
    results.defectdojo = { status: 'not configured' }
  }

  // AI Agent — check if any scans have run with Claude output
  try {
    const scan = db.prepare(`
      SELECT id FROM scans WHERE status = 'complete' AND summary != '' LIMIT 1
    `).get()
    results.aiAgent = { status: scan ? 'connected' : 'not run yet' }
  } catch {
    results.aiAgent = { status: 'unknown' }
  }

  // AWS — just check env vars present
  results.aws = {
    status: process.env.AWS_REGION ? 'connected' : 'not configured'
  }

  res.json(results)
})

export default router
