const ACCOUNT_ID_KEY = "offline_account_id"
const ACCOUNT_TOKEN_FINGERPRINT_KEY = "offline_account_token_fingerprint"

async function fingerprintToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
}

/**
 * Cache the server-verified account identity for offline queue ownership.
 * The identity is bound to a one-way fingerprint of the current access token,
 * so changing accounts cannot reuse the previous account ID.
 */
export async function rememberOfflineAccount(
  userId: string,
  token = localStorage.getItem("access_token") ?? "",
): Promise<void> {
  if (!userId || !token || !crypto.subtle) {
    clearOfflineAccount()
    return
  }
  const fingerprint = await fingerprintToken(token)
  // Re-check after hashing in case another tab changed the session.
  if (localStorage.getItem("access_token") !== token) return
  localStorage.setItem(ACCOUNT_ID_KEY, userId)
  localStorage.setItem(ACCOUNT_TOKEN_FINGERPRINT_KEY, fingerprint)
}

export async function getOfflineAccountId(): Promise<string | null> {
  const token = localStorage.getItem("access_token")
  if (!token || !crypto.subtle) return null
  const [accountId, savedFingerprint] = [
    localStorage.getItem(ACCOUNT_ID_KEY),
    localStorage.getItem(ACCOUNT_TOKEN_FINGERPRINT_KEY),
  ]
  if (!accountId || !savedFingerprint) return null
  return (await fingerprintToken(token)) === savedFingerprint
    ? accountId
    : null
}

export function clearOfflineAccount(): void {
  localStorage.removeItem(ACCOUNT_ID_KEY)
  localStorage.removeItem(ACCOUNT_TOKEN_FINGERPRINT_KEY)
}
