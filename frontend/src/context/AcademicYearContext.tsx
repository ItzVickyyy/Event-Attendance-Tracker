import { useQuery } from "@tanstack/react-query"
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import useAuth from "@/hooks/useAuth"

export type AcademicYear = {
  id: string
  label: string
  start_year: number
  end_year: number
  is_current: boolean
}

type AcademicYearContextValue = {
  academicYears: AcademicYear[]
  activeAcademicYear: AcademicYear | null
  currentAcademicYear: AcademicYear | null
  setActiveAcademicYearId: (id: string) => void
  isLoading: boolean
}

type RepresentativeAssignment = {
  academic_year_id: string
  academic_year: string
}

const AcademicYearContext = createContext<AcademicYearContextValue | null>(null)
const STORAGE_KEY = "active_academic_year_id"

function apiUrl(path: string) {
  return `${import.meta.env.VITE_API_URL ?? ""}/api/v1${path}`
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("access_token")
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function readAcademicYears(): Promise<AcademicYear[]> {
  const response = await fetch(apiUrl("/academic-registry/academic-years"), {
    headers: authHeaders(),
  })
  if (!response.ok) throw new Error("Unable to load academic years")
  const body = await response.json()
  return body.data ?? []
}

async function readRepresentativeAssignment(): Promise<RepresentativeAssignment> {
  const response = await fetch(apiUrl("/class-representatives/me"), {
    headers: authHeaders(),
  })
  if (!response.ok) throw new Error("Unable to load Class Representative assignment")
  return response.json()
}

export function AcademicYearProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const isClassRepresentative = user?.role === "class_representative"
  const [selectedId, setSelectedId] = useState(
    () => localStorage.getItem(STORAGE_KEY) ?? "",
  )
  const query = useQuery({
    queryKey: ["academicYears", "global"],
    queryFn: readAcademicYears,
    staleTime: 60_000,
    enabled: Boolean(
      user &&
        !isClassRepresentative &&
        (!user.is_developer ||
          user.is_superuser ||
          user.role === "admin" ||
          user.role === "super_admin"),
    ),
  })
  const representativeAssignment = useQuery({
    queryKey: ["class-representative-assignment", user?.id],
    queryFn: readRepresentativeAssignment,
    enabled: Boolean(isClassRepresentative && user?.id),
    staleTime: 60_000,
  })

  const representativeYear = useMemo<AcademicYear | null>(() => {
    const assignment = representativeAssignment.data
    if (!assignment) return null
    const match = assignment.academic_year.match(/(\\d{4})\\s*[-–/]\\s*(\\d{4})/)
    const startYear = match ? Number(match[1]) : Number.NaN
    const endYear = match ? Number(match[2]) : Number.NaN
    return {
      id: assignment.academic_year_id,
      label: assignment.academic_year,
      start_year: startYear,
      end_year: endYear,
      is_current: false,
    }
  }, [representativeAssignment.data])

  const academicYears = isClassRepresentative
    ? representativeYear
      ? [representativeYear]
      : []
    : query.data ?? []
  const currentAcademicYear = isClassRepresentative
    ? representativeYear
    : academicYears.find((year) => year.is_current) ?? null
  const activeAcademicYear = isClassRepresentative
    ? representativeYear
    : academicYears.find((year) => year.id === selectedId) ??
      currentAcademicYear

  useEffect(() => {
    if (activeAcademicYear && activeAcademicYear.id !== selectedId) {
      setSelectedId(activeAcademicYear.id)
    }
  }, [activeAcademicYear, selectedId])

  useEffect(() => {
    if (activeAcademicYear)
      localStorage.setItem(STORAGE_KEY, activeAcademicYear.id)
  }, [activeAcademicYear])

  const value = useMemo(
    () => ({
      academicYears,
      activeAcademicYear,
      currentAcademicYear,
      setActiveAcademicYearId: (id: string) => {
        if (!isClassRepresentative) setSelectedId(id)
      },
      isLoading: isClassRepresentative
        ? representativeAssignment.isLoading
        : query.isLoading,
    }),
    [
      academicYears,
      activeAcademicYear,
      currentAcademicYear,
      isClassRepresentative,
      query.isLoading,
      representativeAssignment.isLoading,
    ],
  )

  return (
    <AcademicYearContext.Provider value={value}>
      {children}
    </AcademicYearContext.Provider>
  )
}

export function useAcademicYear() {
  const context = useContext(AcademicYearContext)
  if (!context)
    throw new Error("useAcademicYear must be used inside AcademicYearProvider")
  return context
}
