import type { PersistedUiState } from '@/types'

export async function loadPersistedState(): Promise<PersistedUiState | null> {
  if (window.skillMesh?.storage) {
    return window.skillMesh.storage.loadState()
  }
  try {
    const raw = localStorage.getItem('skill-mesh-ui')
    return raw ? (JSON.parse(raw) as PersistedUiState) : null
  } catch {
    return null
  }
}

export async function savePersistedState(state: PersistedUiState): Promise<void> {
  if (window.skillMesh?.storage) {
    await window.skillMesh.storage.saveState(state)
    return
  }
  localStorage.setItem('skill-mesh-ui', JSON.stringify(state))
}
