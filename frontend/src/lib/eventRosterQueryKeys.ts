export function eventRosterRelatedQueryKeys(eventId: string) {
  return [
    ["eventRoster", eventId],
    ["eventRegistrations", eventId],
    ["eventAttendance", eventId],
    ["event", eventId],
  ] as const
}
