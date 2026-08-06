// ============================================================
//  ToolVault — GitHub Integration Routes
// ============================================================

import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { getSetting } from './settings.js'

const router = Router()

const GITHUB_API_BASE = 'https://api.github.com'

async function githubFetch(endpoint) {
  const token = getSetting('github_token') || process.env.GITHUB_TOKEN

  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'ToolVault-Backend',
  }
  if (token) {
    headers['Authorization'] = `token ${token}`
  }

  console.log(`[GitHub API] ${token ? 'Authenticated' : 'Unauthenticated'} request: ${endpoint}`)

  const response = await fetch(`${GITHUB_API_BASE}${endpoint}`, { headers })

  if (!response.ok) {
    const status = response.status
    const body = await response.text()
    console.error(`[GitHub API] Error ${status} on ${endpoint}`)
    console.error(`[GitHub API] Response: ${body.slice(0, 300)}`)

    if (status === 401) throw new Error('GitHub token is invalid or expired.')
    if (status === 403) {
      if (body.includes('SSO') || body.includes('saml')) {
        throw new Error('Token needs SSO authorization for this organization.')
      }
      throw new Error('GitHub rate limit exceeded or token lacks permissions. Try again later.')
    }
    if (status === 404) throw new Error('NOT_FOUND')
    throw new Error(`GitHub API error (HTTP ${status}).`)
  }

  return response.json()
}

async function fetchReposForOwner(owner) {
  const token = getSetting('github_token') || process.env.GITHUB_TOKEN

  console.log(`[GitHub] fetchReposForOwner("${owner}") — token: ${token ? 'yes (' + token.slice(0, 6) + '...)' : 'none'}`)

  try {
    const orgRepos = await githubFetch(`/users/${owner}/repos?per_page=100&sort=updated&type=all`)
    console.log(`[GitHub] Org endpoint returned ${orgRepos.length} repos`)
    if (orgRepos.length > 0) return orgRepos
  } catch (err) {
    if (err.message !== 'NOT_FOUND') throw err
    console.log(`[GitHub] "${owner}" is not an org — trying as a user account...`)
  }

  if (token) {
    try {
      const allRepos = await githubFetch(`/user/repos?per_page=100&sort=updated&type=all`)
      console.log(`[GitHub] /user/repos returned ${allRepos.length} total repos`)
      const filtered = allRepos.filter(
        (repo) => repo.owner.login.toLowerCase() === owner.toLowerCase()
      )
      console.log(`[GitHub] After filtering for "${owner}": ${filtered.length} repos`)
      if (filtered.length > 0) return filtered
    } catch (err) {
      console.error(`[GitHub] /user/repos failed:`, err.message)
    }
  }

  console.log(`[GitHub] Falling back to public /users/${owner}/repos endpoint`)
  return await githubFetch(`/users/${owner}/repos?per_page=100&sort=updated`)
}

function normalizeRepo(repo) {
  return {
    id:          repo.id,
    name:        repo.name,
    fullName:    repo.full_name,  // e.g. "OWASP/crAPI" — used for scan trigger
    description: repo.description || 'No description provided.',
    language:    repo.language || 'Unknown',
    stars:       repo.stargazers_count,
    forks:       repo.forks_count,
    updatedAt:   repo.updated_at,
    url:         repo.html_url,
    topics:      repo.topics || [],
    openIssues:  repo.open_issues_count,
    visibility:  repo.visibility || (repo.private ? 'private' : 'public'),
    defaultBranch: repo.default_branch || 'main',
  }
}

// ----- GET /repos -----
router.get('/repos', requireAuth, async (req, res) => {
  try {
    const owner = getSetting('github_org') || process.env.GITHUB_ORG
    if (!owner) {
      return res.status(500).json({
        error: 'No GitHub organization or username configured. Go to Integrations to set one.',
      })
    }
    console.log(`[GitHub] Fetching repos for "${owner}"...`)
    const repos = await fetchReposForOwner(owner)
    console.log(`[GitHub] Returning ${repos.length} repos`)
    res.json({ repos: repos.map(normalizeRepo) })
  } catch (err) {
    console.error(`[GitHub] Error fetching repos:`, err.message)
    res.status(502).json({ error: err.message })
  }
})

// ----- GET /repos/search?q=keyword -----
router.get('/repos/search', requireAuth, async (req, res) => {
  try {
    const owner = getSetting('github_org') || process.env.GITHUB_ORG
    const query = req.query.q || ''

    if (!owner) {
      return res.status(500).json({
        error: 'No GitHub organization or username configured. Go to Integrations to set one.',
      })
    }

    if (!query.trim()) {
      const repos = await fetchReposForOwner(owner)
      return res.json({ repos: repos.map(normalizeRepo) })
    }

    const encoded = encodeURIComponent(`${query} user:${owner}`)
    const data = await githubFetch(`/search/repositories?q=${encoded}&per_page=30`)
    res.json({ repos: data.items.map(normalizeRepo) })
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

// ----- GET /pipeline -----
router.get('/pipeline', requireAuth, async (req, res) => {
  try {
    const owner = getSetting('github_org') || process.env.GITHUB_ORG
    if (!owner) {
      return res.status(500).json({
        error: 'No GitHub organization or username configured. Go to Integrations to set one.',
      })
    }

    const repoName = req.query.repo || ''

    if (repoName) {
      const runs = await githubFetch(`/repos/${owner}/${repoName}/actions/runs?per_page=10`)
      return res.json({
        runs: (runs.workflow_runs || []).map(normalizeRun),
        repo: repoName,
        owner,
      })
    }

    const repos = await fetchReposForOwner(owner)
    const repoNames = repos.map((r) => r.name).slice(0, 5)

    let allRuns = []
    let foundRepo = null

    for (const name of repoNames) {
      try {
        const data = await githubFetch(`/repos/${owner}/${name}/actions/runs?per_page=10`)
        if (data.workflow_runs && data.workflow_runs.length > 0) {
          allRuns = data.workflow_runs
          foundRepo = name
          break
        }
      } catch (err) {
        continue
      }
    }

    res.json({
      runs: allRuns.map(normalizeRun),
      repo: foundRepo,
      owner,
    })
  } catch (err) {
    console.error(`[GitHub] Error fetching pipeline runs:`, err.message)
    res.status(502).json({ error: err.message })
  }
})

function normalizeRun(run) {
  return {
    id:          run.id,
    name:        run.name || run.workflow_id,
    status:      run.status,
    conclusion:  run.conclusion,
    branch:      run.head_branch,
    commit:      run.head_sha?.slice(0, 7),
    commitMsg:   run.head_commit?.message?.split('\n')[0] || '',
    event:       run.event,
    createdAt:   run.created_at,
    updatedAt:   run.updated_at,
    url:         run.html_url,
    actor:       run.actor?.login || 'unknown',
    runNumber:   run.run_number,
  }
}

export default router
