export interface AttendeeIdentity {
  id: string
  person_id?: string | null
}

export function attendeeIdQueryKey(student: AttendeeIdentity) {
  return ["attendeeIdForPerson", student.person_id ?? null, student.id] as const
}

export function attendeeCredentialsQueryKey(attendeeId: string | null | undefined) {
  return ["attendeeCredentials", attendeeId ?? null] as const
}
