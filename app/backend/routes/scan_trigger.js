import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { getSetting } from './settings.js'

const router = Router()

const WORKFLOW_FILE = 'ci-cd-pipeline.yml'
const SCAN_REPO    = 'toolvault'
const SCAN_OWNER   = 'maustin44'

async function githubFetch(endpoint, options = {}) {
  const token = getSetting('github_token') || process.env.GITHUB_TOKEN
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'ToolVault-Backend',
    'Content-Type': 'application/json',
  }
  if (token) headers['Authorization'] = `token ${token}`
  const response = await fetch(`https://api.github.com${endpoint}`, { ...options, headers })
  if (!response.ok) {
    const status = response.status
    if (status === 401) throw new Error('GitHub token is invalid or expired.')
    if (status === 403) throw new Error('GitHub token lacks workflow permissions. Add the workflow scope.')
    if (status === 404) throw new Error('Workflow file not found.')
    if (status === 422) throw new Error('Workflow dispatch failed. Make sure workflow_dispatch is enabled.')
    throw new Error(`GitHub API error (HTTP ${status})`)
  }
  const text = await response.text()
  return text ? JSON.parse(text) : {}
}

// POST /api/scan/trigger
router.post('/trigger', requireAuth, async (req, res) => {
  const { targetRepo, targetUrl } = req.body
  try {
    await githubFetch(`/repos/${SCAN_OWNER}/${SCAN_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
      method: 'POST',
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          target_repo: targetRepo || '',
          target_url:  targetUrl  || '',
        },
      }),
    })
    await new Promise(r => setTimeout(r, 3000))
    const runs = await githubFetch(`/repos/${SCAN_OWNER}/${SCAN_REPO}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=1`)
    const latestRun = runs.workflow_runs?.[0]
    res.json({
      success: true,
      message: `Scan triggered for ${targetRepo || 'repository'}.`,
      runId:   latestRun?.id || null,
      runUrl:  latestRun?.html_url || null,
      status:  latestRun?.status || 'queued',
    })
  } catch (err) {
    console.error('[scan-trigger] Error:', err.message)
    res.status(502).json({ error: err.message })
  }
})

// GET /api/scan/status?runId=xxx
router.get('/status', requireAuth, async (req, res) => {
  const { runId } = req.query
  if (!runId) return res.status(400).json({ error: 'runId is required.' })
  try {
    const run  = await githubFetch(`/repos/${SCAN_OWNER}/${SCAN_REPO}/actions/runs/${runId}`)
    const jobs = await githubFetch(`/repos/${SCAN_OWNER}/${SCAN_REPO}/actions/runs/${runId}/jobs`)
    res.json({
      runId:      run.id,
      status:     run.status,
      conclusion: run.conclusion,
      url:        run.html_url,
      createdAt:  run.created_at,
      updatedAt:  run.updated_at,
      jobs: (jobs.jobs || []).map(j => ({
        name:        j.name,
        status:      j.status,
        conclusion:  j.conclusion,
        startedAt:   j.started_at,
        completedAt: j.completed_at,
      }))
    })
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

// GET /api/scan/latest
router.get('/latest', requireAuth, async (req, res) => {
  try {
    const runs = await githubFetch(`/repos/${SCAN_OWNER}/${SCAN_REPO}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=5`)
    const mapped = (runs.workflow_runs || []).map(r => ({
      runId:      r.id,
      status:     r.status,
      conclusion: r.conclusion,
      url:        r.html_url,
      createdAt:  r.created_at,
      event:      r.event,
    }))
    res.json({ runs: mapped })
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

export default router
