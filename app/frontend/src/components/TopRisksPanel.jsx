import { useState, useEffect } from 'react'
import { apiFetch } from '../services/api'
import './TopRisksPanel.css'

const SEV_COLORS = {
  critical: { bg: '#FCEBEB', color: '#A32D2D', label: 'Critical' },
  high:     { bg: '#FAEEDA', color: '#854F0B', label: 'High' },
  medium:   { bg: '#E6F1FB', color: '#185FA5', label: 'Medium' },
  low:      { bg: '#EAF3DE', color: '#3B6D11', label: 'Low' },
}

function TopRisksPanel() {
  const [risks, setRisks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch('/findings/top')
      .then(data => { setRisks(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="glass glass-hover top-risks-panel">
      <div className="panel-head"><h2>Top Risks</h2></div>
      <div className="top-risks-loading"><div className="spinner"></div></div>
    </div>
  )

  if (!risks.length) return null

  return (
    <div className="glass glass-hover top-risks-panel">
      <div className="panel-head">
        <h2>Top Risks</h2>
        <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Highest severity — fix these first</span>
      </div>
      <div className="top-risks-list">
        {risks.map((risk, i) => {
          const sev = SEV_COLORS[risk.severity] || SEV_COLORS.medium
          return (
            <div key={i} className="risk-item">
              <span className="risk-badge" style={{ background: sev.bg, color: sev.color }}>
                {sev.label}
              </span>
              <div className="risk-body">
                <span className="risk-title">{risk.title}</span>
                {risk.file && <span className="risk-file">{risk.file}</span>}
                {risk.remediation && (
                  <div className="risk-fix">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
                    </svg>
                    <span>{risk.remediation}</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default TopRisksPanel
