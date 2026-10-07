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

const AcademicYearContext = createContext<AcademicYearContextValue | null>(null)
const STORAGE_KEY = "active_academic_year_id"

function apiUrl(path: string) {
  return `${import.meta.env.VITE_API_URL ?? ""}/api/v1${path}`
}

async function readAcademicYears(): Promise<AcademicYear[]> {
  const token = localStorage.getItem("access_token")
  const response = await fetch(apiUrl("/academic-registry/academic-years"), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) throw new Error("Unable to load academic years")
  const body = await response.json()
  return body.data ?? []
}

export function AcademicYearProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [selectedId, setSelectedId] = useState(
    () => localStorage.getItem(STORAGE_KEY) ?? "",
  )
  const query = useQuery({
    queryKey: ["academicYears", "global"],
    queryFn: readAcademicYears,
    staleTime: 60_000,
    enabled: Boolean(
      user &&
        (!user.is_developer ||
          user.is_superuser ||
          user.role === "admin" ||
          user.role === "super_admin"),
    ),
  })

  const academicYears = query.data ?? []
  const currentAcademicYear =
    academicYears.find((year) => year.is_current) ?? null
  const activeAcademicYear =
    academicYears.find((year) => year.id === selectedId) ?? currentAcademicYear

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
      setActiveAcademicYearId: (id: string) => setSelectedId(id),
      isLoading: query.isLoading,
    }),
    [academicYears, activeAcademicYear, currentAcademicYear, query.isLoading],
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
