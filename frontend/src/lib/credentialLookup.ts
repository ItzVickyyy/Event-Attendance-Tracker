export function requireCredentialLookupData<T>(result: {
  data?: T
  error?: unknown
}): T {
  if (result.error || result.data == null) {
    throw new Error("No credential found with this NFC UID")
  }
  return result.data
}
