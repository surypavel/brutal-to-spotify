const STORAGE_KEY = 'current_friend_v1'

export interface CurrentFriend {
  identity: string
  name: string
  playlistId?: string
  playlistUrl?: string
}

export function getCurrentFriend(): CurrentFriend | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw ? (JSON.parse(raw) as CurrentFriend) : null
}

export function setCurrentFriend(identity: string, name: string): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ identity, name } satisfies CurrentFriend))
}

export function setCurrentFriendPlaylist(playlistId: string, playlistUrl: string): void {
  const friend = getCurrentFriend()
  if (!friend) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...friend, playlistId, playlistUrl } satisfies CurrentFriend))
}

export function clearCurrentFriend(): void {
  localStorage.removeItem(STORAGE_KEY)
}
