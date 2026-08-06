import './AiImpactPanel.css'

function AiImpactPanel({ impact = {} }) {
  const { total = 0, truePositives = 0, falsePositives = 0, reductionPct = 0 } = impact
  const needsReview = total - truePositives - falsePositives

  // Don't render if there's no data
  if (total === 0) {
    return (
      <div className="ai-impact-panel">
        <div className="ai-impact-header">
          <div className="ai-impact-title-row">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <h2>AI Impact</h2>
            <span className="ai-powered-badge">Powered by Claude</span>
          </div>
        </div>
        <div className="ai-impact-empty">
          <p>No triage data yet. Run a security scan to see AI analysis results.</p>
        </div>
      </div>
    )
  }

  // Build the visual breakdown bar segments
  const tpPct = total > 0 ? (truePositives / total) * 100 : 0
  const fpPct = total > 0 ? (falsePositives / total) * 100 : 0
  const nrPct = total > 0 ? (needsReview / total) * 100 : 0

  return (
    <div className="ai-impact-panel">
      <div className="ai-impact-header">
        <div className="ai-impact-title-row">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <h2>AI Impact</h2>
          <span className="ai-powered-badge">Powered by Claude</span>
        </div>
      </div>

      {/* Key metrics row */}
      <div className="ai-metrics-row">
        <div className="ai-metric">
          <span className="ai-metric-val">{total}</span>
          <span className="ai-metric-label">Total findings</span>
        </div>
        <div className="ai-metric-divider" />
        <div className="ai-metric">
          <span className="ai-metric-val tp">{truePositives}</span>
          <span className="ai-metric-label">True positives</span>
        </div>
        <div className="ai-metric-divider" />
        <div className="ai-metric">
          <span className="ai-metric-val fp">{falsePositives}</span>
          <span className="ai-metric-label">False positives removed</span>
        </div>
        {needsReview > 0 && (
          <>
            <div className="ai-metric-divider" />
            <div className="ai-metric">
              <span className="ai-metric-val nr">{needsReview}</span>
              <span className="ai-metric-label">Needs review</span>
            </div>
          </>
        )}
        <div className="ai-metric-divider" />
        <div className="ai-metric">
          <span className="ai-metric-val reduction">{reductionPct}%</span>
          <span className="ai-metric-label">Noise reduced</span>
        </div>
      </div>

      {/* Visual breakdown bar */}
      <div className="ai-breakdown">
        <div className="ai-breakdown-label">Finding breakdown</div>
        <div className="ai-breakdown-bar">
          {tpPct > 0 && (
            <div className="ai-bar-segment bar-tp" style={{ width: `${tpPct}%` }}>
              {tpPct > 12 && <span>{truePositives}</span>}
            </div>
          )}
          {fpPct > 0 && (
            <div className="ai-bar-segment bar-fp" style={{ width: `${fpPct}%` }}>
              {fpPct > 12 && <span>{falsePositives}</span>}
            </div>
          )}
          {nrPct > 0 && (
            <div className="ai-bar-segment bar-nr" style={{ width: `${nrPct}%` }}>
              {nrPct > 12 && <span>{needsReview}</span>}
            </div>
          )}
        </div>
        <div className="ai-breakdown-legend">
          <span className="legend-item"><span className="legend-dot dot-tp" /> True positive</span>
          <span className="legend-item"><span className="legend-dot dot-fp" /> False positive (removed)</span>
          {needsReview > 0 && (
            <span className="legend-item"><span className="legend-dot dot-nr" /> Needs review</span>
          )}
        </div>
      </div>

      {/* What the AI did */}
      <div className="ai-explanation">
        <div className="ai-explanation-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
        </div>
        <p>
          The AI triage agent reviewed {total} scanner findings by analyzing the surrounding source code context.
          {falsePositives > 0 && ` ${falsePositives} finding${falsePositives > 1 ? 's were' : ' was'} classified as false positive${falsePositives > 1 ? 's' : ''} and automatically filtered out, reducing developer noise by ${reductionPct}%.`}
          {truePositives > 0 && ` ${truePositives} confirmed finding${truePositives > 1 ? 's require' : ' requires'} remediation.`}
        </p>
      </div>
    </div>
  )
}

export default AiImpactPanel
