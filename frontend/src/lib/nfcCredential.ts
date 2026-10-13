/**
 * Extract the canonical NFC credential used by scanner and registration flows.
 * Prefer the physical tag UID when Web NFC exposes it. NDEF text can contain
 * arbitrary payloads unrelated to the card's UID.
 */
export function normalizeNfcCredential(raw: string): string {
  return raw.trim().toUpperCase()
}

type NfcTextRecord = {
  recordType?: string
  data?: unknown
}

type NfcReadingEvent = {
  serialNumber?: unknown
  message?:
    | string
    | {
        records?: NfcTextRecord[]
      }
}

export function extractNfcCredential(event: NfcReadingEvent): string {
  if (
    typeof event.serialNumber === "string" &&
    event.serialNumber.trim()
  ) {
    return normalizeNfcCredential(event.serialNumber)
  }

  const message = event.message
  if (typeof message === "string" && message.trim()) {
    return normalizeNfcCredential(message)
  }

  if (
    message &&
    typeof message === "object" &&
    Array.isArray(message.records)
  ) {
    for (const record of message.records) {
      if (record.recordType !== "text" || !(record.data instanceof DataView)) {
        continue
      }

      const data = record.data
      if (data.byteLength === 0) continue

      const status = data.getUint8(0)
      const isUtf16 = (status & 0x80) !== 0
      const languageLength = status & 0x3f
      const start = 1 + languageLength
      if (start >= data.byteLength) continue

      const bytes = new Uint8Array(
        data.buffer,
        data.byteOffset + start,
        data.byteLength - start,
      )
      const text = new TextDecoder(isUtf16 ? "utf-16" : "utf-8")
        .decode(bytes)
        .trim()
      if (text) return normalizeNfcCredential(text)
    }
  }

  return ""
}
