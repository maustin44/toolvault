// ============================================================
//  ToolVault — Pipeline Scan Results Routes
// ============================================================
//
//  These routes fetch security scanner results from GitHub
//  Actions pipeline artifacts and return them to the SPA.
//
//  ENDPOINTS:
//    GET /api/pipeline-scans              — Get latest scan results
//    GET /api/pipeline-scans/:runId       — Get results for a specific run
//
// ============================================================

import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { getSetting } from './settings.js'

const router = Router()
const GITHUB_API = 'https://api.github.com'

async function githubFetch(endpoint) {
  const token = getSetting('github_token') || process.env.GITHUB_TOKEN
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'ToolVault-Backend',
  }
  if (token) {
    headers['Authorization'] = `token ${token}`
  }

  const response = await fetch(`${GITHUB_API}${endpoint}`, { headers })
  if (!response.ok) {
    throw new Error(`GitHub API error (HTTP ${response.status})`)
  }
  return response.json()
}

// ----- GET / -----
router.get('/', requireAuth, async (req, res) => {
  try {
    const owner = 'maustin44'

    const repoName = req.query.repo || 'toolvault'

    // Get recent workflow runs (fetch more to search across both pipelines)
    const runsData = await githubFetch(`/repos/${owner}/${repoName}/actions/runs?per_page=15`)
    const runs = runsData.workflow_runs || []

    if (runs.length === 0) {
      return res.json({ run: null, allArtifacts: [] })
    }

    // Search through recent runs to find one with the security-scan-results artifact
    let bestRun = null
    let bestArtifacts = []

    for (const run of runs) {
      if (run.status !== 'completed') continue

      const artifactsData = await githubFetch(`/repos/${owner}/${repoName}/actions/runs/${run.id}/artifacts`)
      const artifacts = artifactsData.artifacts || []

      // Look for the security-scan-results artifact specifically
      const hasScanResults = artifacts.some(a => a.name === 'security-scan-results')

      if (hasScanResults) {
        bestRun = run
        bestArtifacts = artifacts
        break
      }

      // If no run has security-scan-results, fall back to any run with artifacts
      if (!bestRun && artifacts.length > 0) {
        bestRun = run
        bestArtifacts = artifacts
      }
    }

    // If still nothing, use the most recent completed run
    if (!bestRun) {
      bestRun = runs.find(r => r.status === 'completed') || runs[0]
      bestArtifacts = []
    }

    res.json({
      run: {
        id: bestRun.id,
        status: bestRun.status,
        conclusion: bestRun.conclusion,
        branch: bestRun.head_branch,
        commit: bestRun.head_sha?.slice(0, 7),
        createdAt: bestRun.created_at,
        url: bestRun.html_url,
        workflow: bestRun.name || bestRun.path,
      },
      hasArtifacts: bestArtifacts.length > 0,
      allArtifacts: bestArtifacts.map(a => ({ id: a.id, name: a.name, size: a.size_in_bytes })),
    })
  } catch (err) {
    console.error('[Pipeline Scans] Error:', err.message)
    res.status(502).json({ error: err.message })
  }
})

export default router
