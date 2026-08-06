// ============================================================
//  ToolVault — Findings Routes
//  Reads scan results from SQLite and returns structured data
//  for the dashboard's vulnerability panel and triage table.
// ============================================================

import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

const DD_URL = process.env.DEFECTDOJO_URL
const DD_KEY = process.env.DEFECTDOJO_API_KEY
const ddHeaders = {
  'Authorization': `Token ${DD_KEY}`,
  'Content-Type': 'application/json'
}
const SCANNER_NAMES = {
  '52': 'Checkov',
  '179': 'Semgrep',
  '92': 'Gitleaks',
  '181': 'Trivy',
  '182': 'ZAP',
  '183': 'NPM Audit'
}

const FIX_HINTS = {
  'unsafe-formatstring': 'Use constant format strings instead of user-controlled input',
  'gcm-no-tag-length': 'Specify authentication tag length in createDecipheriv options',
  'hardcoded': 'Move secrets to environment variables or a secrets manager',
  'sql-injection': 'Use parameterized queries instead of string concatenation',
  'eval': 'Replace eval() with safer alternatives like JSON.parse()',
  'cors': 'Configure CORS with specific allowed origins',
  'ebs-optimized': 'Enable EBS optimization in EC2 instance configuration',
  'monitoring': 'Enable detailed monitoring on EC2 instances',
  'iam-role': 'Attach an IAM role to the EC2 instance',
  'curl': 'Avoid passing secrets directly to curl — use environment variables',
  'permissions': 'Set explicit permissions instead of write-all',
  'metadata': 'Disable IMDSv1 and require IMDSv2 for instance metadata'
}

function getFixHint(title, mitigation) {
  if (mitigation) return mitigation
  const lower = title.toLowerCase()
  for (const [key, hint] of Object.entries(FIX_HINTS)) {
    if (lower.includes(key)) return hint
  }
  return 'Review finding details and apply security best practices'
}



router.get('/', requireAuth, async (req, res) => {
  try {
    const response = await fetch(`${DD_URL}/api/v2/findings/?active=true&limit=200`, { headers: ddHeaders })
    const data = await response.json()
    const findings = (data.results || []).map(f => ({
      id: f.id,
      title: f.title,
      severity: f.severity.toLowerCase(),
      status: f.active ? 'Active' : 'Closed',
      file: f.file_path || null,
      line: f.line || null,
      description: f.description || null,
      remediation: f.mitigation || null,
      falsePositive: f.false_p || false,
      cwe: f.cwe || null,
      scanner: SCANNER_NAMES[f.found_by?.[0]?.toString()] || f.found_by?.[0]?.toString() || 'Unknown',
      repo: 'ToolVault',
    }))
    const summary = {
      total: data.count || findings.length,
      critical: findings.filter(f => f.severity === 'critical').length,
      high: findings.filter(f => f.severity === 'high').length,
      medium: findings.filter(f => f.severity === 'medium').length,
      low: findings.filter(f => f.severity === 'low').length,
    }
    res.json({ summary, findings })
  } catch (err) {
    console.error('Findings error:', err.message)
    res.status(500).json({ error: 'Failed to fetch findings from DefectDojo' })
  }
})

router.get('/top', requireAuth, async (req, res) => {
  try {
    const [critRes, highRes, medRes] = await Promise.all([
      fetch(`${DD_URL}/api/v2/findings/?active=true&severity=Critical&limit=10`, { headers: ddHeaders }),
      fetch(`${DD_URL}/api/v2/findings/?active=true&severity=High&limit=10`, { headers: ddHeaders }),
      fetch(`${DD_URL}/api/v2/findings/?active=true&severity=Medium&limit=10`, { headers: ddHeaders })
    ])
    const critData = await critRes.json()
    const highData = await highRes.json()
    const medData  = await medRes.json()

    const seen = new Set()
    const findings = [...(critData.results || []), ...(highData.results || []), ...(medData.results || [])]
      .filter(f => {
        if (seen.has(f.title)) return false
        seen.add(f.title)
        return true
      })
      .slice(0, 5)
      .map(f => ({
        id:          f.id,
        title:       f.title,
        severity:    f.severity.toLowerCase(),
        file:        f.file_path || null,
        remediation: getFixHint(f.title, f.mitigation),
        scanner:     SCANNER_NAMES[f.found_by?.[0]?.toString()] || f.found_by?.[0]?.toString() || 'Unknown'
       }))

     res.json(findings)
  } catch (err) {
    console.error('Top findings error:', err.message)
    res.status(500).json({ error: 'Failed to fetch top findings' })
  }
})

router.get('/triage', requireAuth, async (req, res) => {
  try {
    const response = await fetch(`${DD_URL}/api/v2/findings/?active=true&limit=200`, { headers: ddHeaders })
    const data = await response.json()
    const findings = data.results || []
    const triage = findings.map(f => ({
      id: f.id,
      title: f.title,
      severity: f.severity.toLowerCase(),
      file: f.file_path || null,
      verdict: f.false_p ? 'False Positive' : 'True Positive',
      confidence: 'High',
      reason: f.description?.split('\n')[0] || null,
      remediation: f.mitigation || null,
      scanner: SCANNER_NAMES[f.found_by?.[0]?.toString()] || f.found_by?.[0]?.toString() || 'Unknown',
      repo: 'ToolVault',
    }))
    const total = data.count || triage.length
    const falsePositives = triage.filter(t => t.verdict === 'False Positive').length
    const truePositives = triage.filter(t => t.verdict === 'True Positive').length
    const reductionPct = total > 0 ? Math.round((falsePositives / total) * 100) : 0
    res.json({
      impact: { total, falsePositives, truePositives, reductionPct },
      triage
    })
  } catch (err) {
    console.error('Triage error:', err.message)
    res.status(500).json({ error: 'Failed to fetch triage data' })
  }
})

export default router
