// ============================================================
//  ToolVault — Pipeline Scans Service
// ============================================================
//
//  Fetches security scanner results from the CI/CD pipeline
//  via the backend API.
//
// ============================================================

import { apiFetch } from './api.js'

/** Fetch the latest pipeline run and its scan artifacts. */
export async function getLatestPipelineScan(repo) {
  const query = repo ? `?repo=${encodeURIComponent(repo)}` : ''
  return apiFetch(`/pipeline-scans${query}`)
}

/** Get findings from a specific artifact. */
export async function getArtifactFindings(artifactId, repo) {
  const query = repo ? `?repo=${encodeURIComponent(repo)}` : ''
  return apiFetch(`/pipeline-scans/findings/${artifactId}${query}`)
}
