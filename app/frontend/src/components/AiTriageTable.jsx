import './AiTriageTable.css'

const VERDICT_CONFIG = {
  'True Positive':  { className: 'verdict-tp',     label: 'True Positive'  },
  'False Positive': { className: 'verdict-fp',     label: 'False Positive' },
  'Needs Review':   { className: 'verdict-review', label: 'Needs Review'   },
}

const SEVERITY_CONFIG = {
  critical: { className: 'sev-critical', label: 'Critical' },
  high:     { className: 'sev-high',     label: 'High'     },
  medium:   { className: 'sev-medium',   label: 'Medium'   },
  low:      { className: 'sev-low',      label: 'Low'      },
  info:     { className: 'sev-info',     label: 'Info'     },
}

function ConfidencePips({ level }) {
  const filled = level === 'High' ? 3 : level === 'Medium' ? 2 : 1
  return (
    <div className="confidence-pips">
      {[1, 2, 3].map(i => (
        <span key={i} className={`pip ${i <= filled ? `pip-filled-${level.toLowerCase()}` : ''}`} />
      ))}
      <span className="confidence-label">{level}</span>
    </div>
  )
}

function AiTriageTable({ triage = [], impact = {}, limit = 10 }) {
  if (!triage.length) {
    return (
      <div className="triage-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>No triage data yet. Run a scan on a repository to see AI decisions here.</p>
      </div>
    )
  }

  return (
    <div className="triage-wrap">
      {/* Impact summary bar */}
      {impact.total > 0 && (
        <div className="triage-impact">
          <div className="impact-stat">
            <span className="impact-val">{impact.total}</span>
            <span className="impact-label">Total findings</span>
          </div>
          <div className="impact-divider" />
          <div className="impact-stat">
            <span className="impact-val tp">{impact.truePositives}</span>
            <span className="impact-label">True positives</span>
          </div>
          <div className="impact-divider" />
          <div className="impact-stat">
            <span className="impact-val fp">{impact.falsePositives}</span>
            <span className="impact-label">False positives filtered</span>
          </div>
          <div className="impact-divider" />
          <div className="impact-stat">
            <span className="impact-val reduction">{impact.reductionPct}%</span>
            <span className="impact-label">Noise reduced by AI</span>
          </div>
        </div>
      )}

      {/* Triage table */}
      <div className="triage-table-wrap">
        <table className="triage-table">
          <thead>
            <tr>
              <th>Finding</th>
              <th>Severity</th>
              <th>Scanner</th>
              <th>AI Verdict</th>
              <th>Confidence</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {triage.slice(0, limit).map((item, i) => {
              const verdict   = VERDICT_CONFIG[item.verdict]   || VERDICT_CONFIG['Needs Review']
              const severity  = SEVERITY_CONFIG[item.severity] || SEVERITY_CONFIG['info']
              return (
                <tr key={i}>
                  <td>
                    <div className="finding-title">{item.title}</div>
                    {item.file && <div className="finding-file">{item.file}</div>}
                  </td>
                  <td><span className={`sev-badge ${severity.className}`}>{severity.label}</span></td>
                  <td><span className="scanner-name">{item.scanner}</span></td>
                  <td><span className={`verdict-badge ${verdict.className}`}>{verdict.label}</span></td>
                  <td><ConfidencePips level={item.confidence || 'Low'} /></td>
                  <td><span className="reason-text">{item.reason || '—'}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
	   {triage.length > limit && (
             <div style={{ textAlign: 'center', padding: '12px 0 4px', borderTop: '0.5px solid #eee' }}>
               <a href="/triage" style={{ fontSize: '13px', color: '#378ADD', textDecoration: 'none' }}>
                 View all {triage.length} findings →
               </a>
             </div>
)}
      </div>
    </div>
  )
}

export default AiTriageTable
