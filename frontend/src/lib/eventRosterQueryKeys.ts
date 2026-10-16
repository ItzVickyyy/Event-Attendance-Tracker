export function eventRosterRelatedQueryKeys(eventId: string) {
  return [
    ["eventRoster", eventId],
    ["eventRegistrations", eventId],
    ["eventAttendance", eventId],
    ["event", eventId],
  ] as const
}

export function eventSessionRelatedQueryKeys(eventId: string) {
  return [
    ["attendanceSessions", eventId],
    ["eventRoster", eventId],
  ] as const
}
