import { apiFetch } from './api.js'

export async function getLatestReport() {
  return apiFetch('/report/latest')
}
