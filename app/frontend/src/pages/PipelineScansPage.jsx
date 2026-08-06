import { useState, useEffect } from 'react'
import { getLatestPipelineScan } from '../services/pipelineScans'
import './PipelineScansPage.css'

const STATUS_CONFIG = {
  success:   { label: 'Passed',    color: '#166534', bg: '#ecfdf5' },
  failure:   { label: 'Failed',    color: '#991b1b', bg: '#fef2f2' },
  cancelled: { label: 'Cancelled', color: '#92400e', bg: '#fefce8' },
  null:      { label: 'Running',   color: '#1e40af', bg: '#eff6ff' },
}

const TOOL_INFO = {
  'security-scan-results': {
    tools: [
      { name: 'npm audit',  type: 'SCA',     desc: 'Checks npm dependencies for known CVEs' },
      { name: 'Semgrep',    type: 'SAST',    desc: 'Scans source code for insecure patterns' },
      { name: 'GitLeaks',   type: 'Secrets', desc: 'Searches Git history for leaked credentials' },
      { name: 'Trivy',      type: 'SCA/IaC', desc: 'Scans dependencies, containers, and Terraform' },
      { name: 'Checkov',    type: 'IaC',     desc: 'Checks Terraform configs against best practices' },
    ]
  },
  'zap-scan-results': {
    tools: [
      { name: 'OWASP ZAP', type: 'DAST', desc: 'Tests the live application for runtime vulnerabilities' },
    ]
  },
}

function PipelineScansPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const result = await getLatestPipelineScan()
      setData(result)
    } catch (err) {
      setError(err.message || 'Failed to load pipeline scan data.')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="page-state">
        <div className="spinner"></div>
        <p>Loading pipeline data...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page-state">
        <div className="error-box">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <div>
            <strong>Error loading pipeline data</strong>
            <p>{error}</p>
          </div>
          <button onClick={loadData} className="retry-btn">Retry</button>
        </div>
      </div>
    )
  }

  if (!data || !data.run) {
    return (
      <div className="page-state">
        <p>No pipeline runs found. Push code to the development branch to trigger a run.</p>
      </div>
    )
  }

  const run = data.run
  const statusConfig = STATUS_CONFIG[run.conclusion] || STATUS_CONFIG[null]

  return (
    <div className="pipeline-page">
      <div className="page-top">
        <h1>Pipeline scans</h1>
        <p className="page-desc">Security scanner results from the CI/CD pipeline</p>
      </div>

      {/* Latest run info */}
      <div className="run-card">
        <div className="run-card-header">
          <h2>Latest pipeline run</h2>
          <span className="run-status" style={{ background: statusConfig.bg, color: statusConfig.color }}>
            {statusConfig.label}
          </span>
        </div>
        <div className="run-details">
          <span>Branch: <strong>{run.branch}</strong></span>
          <span className="detail-sep">·</span>
          <span>Commit: <code>{run.commit}</code></span>
          <span className="detail-sep">·</span>
          <span>{formatDate(run.createdAt)}</span>
          <span className="detail-sep">·</span>
          <a href={run.url} target="_blank" rel="noopener noreferrer" className="run-link">View on GitHub</a>
        </div>
      </div>

      {/* Scanner tools used */}
      <div className="panel">
        <div className="panel-head">
          <h2>Security scanners ({data.allArtifacts?.length || 0} artifact{data.allArtifacts?.length !== 1 ? 's' : ''} produced)</h2>
        </div>

        {data.allArtifacts && data.allArtifacts.length > 0 ? (
          <table className="tools-table">
            <thead>
              <tr>
                <th>Artifact</th>
                <th>Tools included</th>
                <th>Type</th>
                <th>Size</th>
              </tr>
            </thead>
            <tbody>
              {data.allArtifacts.map((artifact) => {
                const info = TOOL_INFO[artifact.name]
                if (info) {
                  return info.tools.map((tool, idx) => (
                    <tr key={`${artifact.id}-${idx}`}>
                      {idx === 0 && (
                        <td rowSpan={info.tools.length} className="artifact-name">
                          <code>{artifact.name}</code>
                          <span className="artifact-size">{(artifact.size / 1024).toFixed(1)} KB</span>
                        </td>
                      )}
                      <td className="tool-name">{tool.name}</td>
                      <td><span className="type-badge">{tool.type}</span></td>
                      <td className="tool-desc">{tool.desc}</td>
                    </tr>
                  ))
                }
                return (
                  <tr key={artifact.id}>
                    <td className="artifact-name"><code>{artifact.name}</code></td>
                    <td colSpan="2">Custom scanner output</td>
                    <td>{(artifact.size / 1024).toFixed(1)} KB</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div className="no-artifacts">
            <p>No scan artifacts found for this run.</p>
            <p className="no-artifacts-hint">Make sure the pipeline uploads scan results using <code>actions/upload-artifact</code>.</p>
          </div>
        )}
      </div>

      {/* How the scanners connect */}
      <div className="panel">
        <div className="panel-head">
          <h2>Pipeline flow</h2>
        </div>
        <div className="flow-steps">
          <div className="flow-step">
            <div className="step-number">1</div>
            <div className="step-content">
              <strong>Build</strong>
              <p>Frontend compiled with Vite</p>
            </div>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">
            <div className="step-number">2</div>
            <div className="step-content">
              <strong>Security scans</strong>
              <p>5 scanners run in parallel</p>
            </div>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">
            <div className="step-number">3</div>
            <div className="step-content">
              <strong>Deploy</strong>
              <p>SSH to EC2, pull and build</p>
            </div>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">
            <div className="step-number">4</div>
            <div className="step-content">
              <strong>DAST scan</strong>
              <p>OWASP ZAP on live app</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PipelineScansPage
