import { useState, useEffect } from 'react'
import AiTriageTable from '../components/AiTriageTable'
import { getTriage } from '../services/api'
import './TriagePage.css'

function TriagePage() {
  const [triage, setTriage] = useState({ impact: {}, triage: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getTriage()
      .then(data => {
        const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
        const sorted = [...(data.triage || [])].sort((a, b) => 
          (order[a.severity] ?? 5) - (order[b.severity] ?? 5)
        )
        setTriage({ ...data, triage: sorted })
        setLoading(false)
})
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="triage-page">
      <div className="page-top">
        <h1>AI Triage Decisions</h1>
        <p className="page-desc">All findings reviewed and classified by the AI security agent</p>
      </div>
      {loading ? (
        <div className="page-state"><div className="spinner"></div><p>Loading triage data...</p></div>
      ) : (
        <div className="panel">
          <AiTriageTable triage={triage.triage} impact={triage.impact} limit={triage.triage.length} />
        </div>
      )}
    </div>
  )
}

export default TriagePage
