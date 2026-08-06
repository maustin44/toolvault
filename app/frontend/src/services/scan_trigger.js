import { apiFetch } from './api.js'

export async function triggerScan({ targetRepo = '', targetUrl = '' } = {}) {
  return apiFetch('/scan/trigger', {
    method: 'POST',
    body: JSON.stringify({ targetRepo, targetUrl }),
  })
}

export async function getScanStatus(runId) {
  return apiFetch(`/scan/status?runId=${runId}`)
}

export async function getLatestScans() {
  return apiFetch('/scan/latest')
}

export async function pollScanUntilDone(runId, onUpdate, intervalMs = 5000) {
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const data = await getScanStatus(runId)
        if (onUpdate) onUpdate(data)
        if (data.status === 'completed') {
          resolve(data)
        } else {
          setTimeout(poll, intervalMs)
        }
      } catch (err) {
        reject(err)
      }
    }
    poll()
  })
}

export const RUN_CONCLUSION = {
  success:   { label: 'Success',   color: '#16a34a' },
  failure:   { label: 'Failed',    color: '#dc2626' },
  cancelled: { label: 'Cancelled', color: '#6b7280' },
  skipped:   { label: 'Skipped',   color: '#6b7280' },
}
