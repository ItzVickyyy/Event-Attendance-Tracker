export type AttendanceSessionType = "TIME_IN" | "TIME_OUT" | "CUSTOM"
export type AttendanceSessionStatus =
  | "SCHEDULED"
  | "OPEN"
  | "CLOSED"
  | "CANCELLED"

export interface AttendanceSession {
  id: string
  event_id: string
  session_date: string
  name: string
  session_type: AttendanceSessionType
  start_time?: string | null
  end_time?: string | null
  late_cutoff?: string | null
  status: AttendanceSessionStatus
  display_order: number
  is_active: boolean
  created_at?: string | null
  updated_at?: string | null
}

const apiBase = import.meta.env.VITE_API_URL ?? ""
const cacheKey = (eventId: string) => `attendance-active-session:${eventId}`

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("access_token")
  const response = await fetch(`${apiBase}/api/v1${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
  })
  if (!response.ok) {
    let detail = "Request failed"
    try {
      const body = await response.json()
      detail = body?.detail ?? detail
    } catch {}
    throw new Error(detail)
  }
  return response.json()
}

export async function getAttendanceSessions(
  eventId: string,
): Promise<AttendanceSession[]> {
  const result = await request<{ data: AttendanceSession[] }>(
    `/attendance-sessions/?event_id=${encodeURIComponent(eventId)}`,
  )
  return result.data
}

export async function getActiveAttendanceSession(
  eventId: string,
): Promise<AttendanceSession | null> {
  try {
    const session = await request<AttendanceSession>(
      `/attendance-sessions/active/${encodeURIComponent(eventId)}`,
    )
    localStorage.setItem(cacheKey(eventId), JSON.stringify(session))
    return session
  } catch {
    const cached = localStorage.getItem(cacheKey(eventId))
    if (!cached) return null
    try {
      return JSON.parse(cached) as AttendanceSession
    } catch {
      return null
    }
  }
}

export async function createAttendanceSession(
  session: Omit<AttendanceSession, "id" | "created_at" | "updated_at">,
): Promise<AttendanceSession> {
  const created = await request<AttendanceSession>("/attendance-sessions/", {
    method: "POST",
    body: JSON.stringify(session),
  })
  if (created.is_active)
    localStorage.setItem(cacheKey(created.event_id), JSON.stringify(created))
  return created
}

export async function activateAttendanceSession(
  id: string,
): Promise<AttendanceSession> {
  const activated = await request<AttendanceSession>(
    `/attendance-sessions/${id}/activate`,
    { method: "POST" },
  )
  localStorage.setItem(cacheKey(activated.event_id), JSON.stringify(activated))
  return activated
}

export async function closeAttendanceSession(
  id: string,
): Promise<AttendanceSession> {
  return request<AttendanceSession>(`/attendance-sessions/${id}/close`, {
    method: "POST",
  })
}

export interface SessionRosterEntry {
  event_id: string
  attendee_id: string
  registration_status: string
  person_name: string
  student_number?: string | null
  attendance_session_id?: string | null
  attendance_status?: string | null
  time_in?: string | null
  time_out?: string | null
  is_late?: boolean
  scan_method?: string | null
  credentials: Array<{
    credential_type: string
    credential_value: string
    is_active: boolean
  }>
}

export async function getEventRoster(
  eventId: string,
  attendanceSessionId?: string,
): Promise<SessionRosterEntry[]> {
  const query = attendanceSessionId
    ? `?attendance_session_id=${encodeURIComponent(attendanceSessionId)}`
    : ""
  const result = await request<{ data: SessionRosterEntry[] }>(
    `/events/${encodeURIComponent(eventId)}/roster/${query}`,
  )
  return result.data
}
