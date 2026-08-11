import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { getSetting } from './settings.js'
import AdmZip from 'adm-zip'

const router = Router()

const OWNER = 'maustin44'
const REPO  = 'toolvault'

async function githubFetch(endpoint) {
  const token = getSetting('github_token') || process.env.GITHUB_TOKEN
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'ToolVault-Backend',
  }
  if (token) headers['Authorization'] = `token ${token}`
  const response = await fetch(`https://api.github.com${endpoint}`, { headers })
  if (!response.ok) throw new Error(`GitHub API error (HTTP ${response.status})`)
  return response.json()
}

async function downloadArtifactZip(artifactId) {
  const token = getSetting('github_token') || process.env.GITHUB_TOKEN
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'ToolVault-Backend',
  }
  if (token) headers['Authorization'] = `token ${token}`

  // Step 1 — get the redirect URL from GitHub (do NOT follow redirect automatically)
  const redirectRes = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/actions/artifacts/${artifactId}/zip`,
    { headers, redirect: 'manual' }
  )

  // GitHub returns 302 with a signed S3 URL in the Location header
  const signedUrl = redirectRes.headers.get('location')
  if (!signedUrl) throw new Error('No redirect URL returned from GitHub artifact download.')

  // Step 2 — fetch the signed S3 URL WITHOUT any GitHub headers
  const zipRes = await fetch(signedUrl)
  if (!zipRes.ok) throw new Error(`Artifact download failed (HTTP ${zipRes.status})`)

  return Buffer.from(await zipRes.arrayBuffer())
}

// GET /api/report/latest
router.get('/latest', requireAuth, async (req, res) => {
  try {
    // Step 1 — find the latest security-report artifact
    const data = await githubFetch(`/repos/${OWNER}/${REPO}/actions/artifacts?name=security-report&per_page=1`)
    const artifact = data.artifacts?.[0]
    if (!artifact) return res.status(404).json({ error: 'No security report found yet. Trigger a scan first.' })

    // Step 2 — download the zip via signed S3 URL
    const zipBuffer = await downloadArtifactZip(artifact.id)

    // Step 3 — unzip and extract security-report.md
    const zip = new AdmZip(zipBuffer)
    const entry = zip.getEntry('security-report.md')
    if (!entry) return res.status(404).json({ error: 'security-report.md not found in artifact.' })

    const markdown = zip.readAsText(entry)

    res.json({
      markdown,
      generatedAt: artifact.created_at,
      artifactId: artifact.id,
      workflowRunId: artifact.workflow_run?.id,
      expiresAt: artifact.expires_at,
    })
  } catch (err) {
    console.error('[report] Error:', err.message)
    res.status(502).json({ error: err.message })
  }
})

export default router
