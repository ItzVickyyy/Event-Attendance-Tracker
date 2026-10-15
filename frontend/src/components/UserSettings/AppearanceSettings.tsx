import {
  Contrast,
  Monitor,
  Moon,
  Palette,
  RotateCcw,
  Sun,
  Type,
} from "lucide-react"
import { useEffect, useState } from "react"

import { type Theme, useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import useAuth from "@/hooks/useAuth"

const STORAGE_KEY = "event-attendance-appearance-preferences"

type ColorKey = "accent" | "background" | "foreground"
type FontSize = "small" | "default" | "large" | "extra-large"
type ContrastMode = "standard" | "high"

type AppearancePreferences = {
  theme: Theme
  accent: string | null
  background: string | null
  foreground: string | null
  fontSize: FontSize
  contrast: ContrastMode
}

const DEFAULT_PREFERENCES: AppearancePreferences = {
  theme: "system",
  accent: null,
  background: null,
  foreground: null,
  fontSize: "default",
  contrast: "standard",
}

const COLOR_DEFAULTS = {
  light: {
    accent: "#0f766e",
    background: "#f8fafc",
    foreground: "#1e293b",
  },
  dark: {
    accent: "#5eead4",
    background: "#171d2a",
    foreground: "#e2e8f0",
  },
}

const isHexColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value)

/** Keep the top-navigation theme toggle in sync with account-scoped preferences. */
export function persistAccountAppearanceTheme(theme: Theme, userId?: string) {
  if (!userId) return

  try {
    const storageKey = `${STORAGE_KEY}:${userId}`
    const stored = localStorage.getItem(storageKey)
    const current = stored ? JSON.parse(stored) : DEFAULT_PREFERENCES
    localStorage.setItem(
      storageKey,
      JSON.stringify({ ...DEFAULT_PREFERENCES, ...current, theme }),
    )
  } catch {
    // The theme still applies for this session if local storage is unavailable.
  }

  const token = localStorage.getItem("access_token")
  if (token) {
    void fetch("/api/v1/users/me/appearance-preferences", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ theme }),
    }).catch(() => {
      // Keep the local account-scoped preference if the API is unavailable.
    })
  }
}

function readPreferences(userId?: string): AppearancePreferences {
  try {
    const storageKey = userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY
    const stored = localStorage.getItem(storageKey)
    if (!stored) return DEFAULT_PREFERENCES

    const parsed = JSON.parse(stored) as Partial<AppearancePreferences>
    return {
      theme:
        parsed.theme === "light" || parsed.theme === "dark"
          ? parsed.theme
          : "system",
      accent:
        typeof parsed.accent === "string" && isHexColor(parsed.accent)
          ? parsed.accent
          : null,
      background:
        typeof parsed.background === "string" && isHexColor(parsed.background)
          ? parsed.background
          : null,
      foreground:
        typeof parsed.foreground === "string" && isHexColor(parsed.foreground)
          ? parsed.foreground
          : null,
      fontSize: ["small", "default", "large", "extra-large"].includes(
        String(parsed.fontSize),
      )
        ? (parsed.fontSize as FontSize)
        : "default",
      contrast: parsed.contrast === "high" ? "high" : "standard",
    }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

function getContrastingText(hex: string) {
  const rgb = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((part) => Number.parseInt(part, 16) / 255) ?? [0, 0, 0]
  const linear = rgb.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  )
  const luminance =
    0.2126 * (linear[0] ?? 0) +
    0.7152 * (linear[1] ?? 0) +
    0.0722 * (linear[2] ?? 0)

  return luminance > 0.179 ? "#102027" : "#ffffff"
}

function applyPreferences(preferences: AppearancePreferences) {
  const root = document.documentElement
  const style = root.style
  const colorVariables = [
    "--primary",
    "--primary-foreground",
    "--accent",
    "--accent-foreground",
    "--sidebar-accent",
    "--sidebar-accent-foreground",
    "--ring",
    "--sidebar-primary",
    "--chart-1",
    "--background",
    "--card",
    "--popover",
    "--sidebar",
    "--foreground",
    "--card-foreground",
    "--popover-foreground",
    "--sidebar-foreground",
  ]

  for (const variable of colorVariables) {
    style.removeProperty(variable)
  }

  if (preferences.accent) {
    style.setProperty("--primary", preferences.accent)
    style.setProperty(
      "--primary-foreground",
      getContrastingText(preferences.accent),
    )
    style.setProperty(
      "--accent",
      `color-mix(in srgb, ${preferences.accent} 18%, var(--background))`,
    )
    style.setProperty("--accent-foreground", "var(--foreground)")
    style.setProperty(
      "--sidebar-accent",
      `color-mix(in srgb, ${preferences.accent} 18%, var(--background))`,
    )
    style.setProperty("--sidebar-accent-foreground", "var(--foreground)")
    style.setProperty("--ring", preferences.accent)
    style.setProperty("--sidebar-primary", preferences.accent)
    style.setProperty("--chart-1", preferences.accent)
  }

  if (preferences.background) {
    style.setProperty("--background", preferences.background)
    style.setProperty(
      "--card",
      `color-mix(in srgb, ${preferences.background} 96%, var(--foreground))`,
    )
    style.setProperty(
      "--popover",
      `color-mix(in srgb, ${preferences.background} 94%, var(--foreground))`,
    )
    style.setProperty(
      "--sidebar",
      `color-mix(in srgb, ${preferences.background} 98%, var(--foreground))`,
    )
  }

  if (preferences.foreground) {
    style.setProperty("--foreground", preferences.foreground)
    style.setProperty("--card-foreground", preferences.foreground)
    style.setProperty("--popover-foreground", preferences.foreground)
    style.setProperty("--sidebar-foreground", preferences.foreground)
  }

  root.dataset.uiFontSize = preferences.fontSize
  root.classList.toggle("high-contrast", preferences.contrast === "high")
  if (preferences.contrast === "high") {
    style.setProperty("--ring", preferences.foreground ?? "var(--foreground)")
  }
}

export function AppearancePreferencesInitializer() {
  const { user } = useAuth()
  const { setTheme } = useTheme()

  useEffect(() => {
    let cancelled = false
    const applySavedPreferences = async () => {
      const localPreferences = readPreferences(user?.id)
      let preferences = localPreferences
      const token = localStorage.getItem("access_token")
      if (user?.id && token) {
        try {
          const response = await fetch(
            "/api/v1/users/me/appearance-preferences",
            {
              headers: { Authorization: `Bearer ${token}` },
            },
          )
          if (response.ok) {
            const saved = await response.json()
            preferences = {
              ...DEFAULT_PREFERENCES,
              ...localPreferences,
              ...saved,
            }

            // Migrate browser-only preferences into the account record once.
            if (Object.keys(saved).length === 0) {
              await fetch("/api/v1/users/me/appearance-preferences", {
                method: "PATCH",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(localPreferences),
              })
            }

            localStorage.setItem(
              `${STORAGE_KEY}:${user.id}`,
              JSON.stringify(preferences),
            )
          }
        } catch {
          // Use the account-scoped local copy if the API is temporarily unavailable.
        }
      }
      if (cancelled) return
      applyPreferences(preferences)
      setTheme(preferences.theme)
    }
    void applySavedPreferences()
    return () => {
      cancelled = true
    }
  }, [user?.id, setTheme])

  return null
}

function ChoiceButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "outline"}
      aria-pressed={active}
      onClick={onClick}
      className="h-auto min-h-11 justify-start gap-2 px-3 py-2"
    >
      {children}
    </Button>
  )
}

export function AppearanceSettings() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const { user } = useAuth()
  const [preferences, setPreferences] = useState<AppearancePreferences>(() =>
    readPreferences(user?.id),
  )
  const [hexDrafts, setHexDrafts] = useState<Record<ColorKey, string>>({
    accent: COLOR_DEFAULTS.light.accent,
    background: COLOR_DEFAULTS.light.background,
    foreground: COLOR_DEFAULTS.light.foreground,
  })
  const [invalidHex, setInvalidHex] = useState<ColorKey | null>(null)
  const defaults = COLOR_DEFAULTS[resolvedTheme]

  useEffect(() => {
    setHexDrafts({
      accent: preferences.accent ?? defaults.accent,
      background: preferences.background ?? defaults.background,
      foreground: preferences.foreground ?? defaults.foreground,
    })
  }, [preferences, defaults])

  const savePreferences = (next: AppearancePreferences) => {
    setPreferences(next)

    setTheme(next.theme)
    try {
      localStorage.setItem(
        user?.id ? `${STORAGE_KEY}:${user.id}` : STORAGE_KEY,
        JSON.stringify(next),
      )
    } catch {
      // Preferences still apply for this session if storage is unavailable.
    }
    const token = localStorage.getItem("access_token")
    if (user?.id && token) {
      void fetch("/api/v1/users/me/appearance-preferences", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(next),
      }).catch(() => {
        // Keep the account-scoped local copy if the API is temporarily unavailable.
      })
    }
    applyPreferences(next)
  }

  const updateColor = (key: ColorKey, value: string) => {
    setHexDrafts((current) => ({ ...current, [key]: value }))

    if (!isHexColor(value)) {
      setInvalidHex(key)
      return
    }

    setInvalidHex(null)
    savePreferences({ ...preferences, [key]: value.toLowerCase() })
  }

  const clearColorOverride = (key: ColorKey) => {
    savePreferences({ ...preferences, [key]: null })
    setHexDrafts((current) => ({ ...current, [key]: defaults[key] }))
    setInvalidHex(null)
  }

  const resetAll = () => {
    savePreferences(DEFAULT_PREFERENCES)
    setHexDrafts({
      accent: COLOR_DEFAULTS[resolvedTheme].accent,
      background: COLOR_DEFAULTS[resolvedTheme].background,
      foreground: COLOR_DEFAULTS[resolvedTheme].foreground,
    })
    setInvalidHex(null)
  }

  const colors: {
    key: ColorKey
    title: string
    description: string
  }[] = [
    {
      key: "accent",
      title: "Accent",
      description: "Buttons, selected items, highlights, and focus accents.",
    },
    {
      key: "background",
      title: "Background",
      description: "The main page and surface background color.",
    },
    {
      key: "foreground",
      title: "Foreground",
      description: "The primary text and icon color.",
    },
  ]

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-0 md:grid-cols-[180px_minmax(0,1fr)] md:grid-rows-1">
      <nav
        aria-label="Settings sections"
        className="flex gap-2 border-b p-3 md:sticky md:top-0 md:flex-col md:self-start md:border-b-0 md:border-r md:p-4"
      >
        <Button
          type="button"
          variant="secondary"
          className="shrink-0 justify-start"
          aria-current="location"
          onClick={() =>
            document
              .getElementById("appearance-settings-title")
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
        >
          Appearance
        </Button>
      </nav>
      <div className="min-h-0 min-w-0 space-y-5 overflow-y-auto overscroll-contain p-4 sm:p-6">
        <h2
          id="appearance-settings-title"
          className="text-lg font-semibold tracking-tight"
        >
          Appearance
        </h2>
        <section aria-labelledby="visual-style-title">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Monitor className="size-5 text-primary" />
                <CardTitle id="visual-style-title">Visual Style</CardTitle>
              </div>
              <CardDescription>
                Choose how the application should look.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-3">
                <ChoiceButton
                  active={theme === "light"}
                  onClick={() =>
                    savePreferences({ ...preferences, theme: "light" })
                  }
                >
                  <Sun className="size-4 shrink-0" />
                  Light Mode
                </ChoiceButton>
                <ChoiceButton
                  active={theme === "dark"}
                  onClick={() =>
                    savePreferences({ ...preferences, theme: "dark" })
                  }
                >
                  <Moon className="size-4 shrink-0" />
                  Dark Mode
                </ChoiceButton>
                <ChoiceButton
                  active={theme === "system"}
                  onClick={() =>
                    savePreferences({ ...preferences, theme: "system" })
                  }
                >
                  <Monitor className="size-4 shrink-0" />
                  System Default
                </ChoiceButton>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {theme === "system"
                  ? `Following your device appearance. Currently ${resolvedTheme}.`
                  : `Using ${theme} mode until you change this setting.`}
              </p>
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="theme-colors-title">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Palette className="size-5 text-primary" />
                <CardTitle id="theme-colors-title">Theme Colors</CardTitle>
              </div>
              <CardDescription>
                Personalize the colors used across the interface. Leave a color
                at its default to follow the selected visual style.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {colors.map(({ key, title, description }) => {
                const value = preferences[key] ?? defaults[key]

                return (
                  <div
                    key={key}
                    className="grid gap-3 border-b pb-5 last:border-b-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div className="space-y-1">
                      <Label htmlFor={`appearance-${key}`}>{title}</Label>
                      <p className="text-sm text-muted-foreground">
                        {description}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        id={`appearance-${key}`}
                        aria-label={`${title} color picker`}
                        type="color"
                        value={value}
                        onChange={(event) =>
                          updateColor(key, event.target.value)
                        }
                        className="h-11 w-14 cursor-pointer rounded-md border border-input bg-background p-1"
                      />
                      <Input
                        aria-label={`${title} HEX color`}
                        value={hexDrafts[key]}
                        onChange={(event) =>
                          updateColor(key, event.target.value)
                        }
                        onBlur={() => {
                          if (!isHexColor(hexDrafts[key])) {
                            setHexDrafts((current) => ({
                              ...current,
                              [key]: preferences[key] ?? defaults[key],
                            }))
                            setInvalidHex(null)
                          }
                        }}
                        aria-invalid={invalidHex === key}
                        className="w-28 font-mono uppercase"
                        maxLength={7}
                        spellCheck={false}
                      />
                      {preferences[key] && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => clearColorOverride(key)}
                        >
                          Reset
                        </Button>
                      )}
                      {invalidHex === key && (
                        <p
                          className="w-full text-xs text-destructive"
                          role="alert"
                        >
                          Enter a valid HEX color, such as #0F766E.
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="advanced-appearance-title">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Contrast className="size-5 text-primary" />
                <CardTitle id="advanced-appearance-title">Advanced</CardTitle>
              </div>
              <CardDescription>
                Adjust readability and interface density.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:items-start">
                <div className="space-y-1">
                  <Label
                    htmlFor="appearance-font-size"
                    className="flex items-center gap-2"
                  >
                    <Type className="size-4" />
                    UI Font Size
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Changes the base text and spacing scale throughout the app.
                  </p>
                </div>
                <select
                  id="appearance-font-size"
                  value={preferences.fontSize}
                  onChange={(event) =>
                    savePreferences({
                      ...preferences,
                      fontSize: event.target.value as FontSize,
                    })
                  }
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-base"
                >
                  <option value="small">Small</option>
                  <option value="default">Default</option>
                  <option value="large">Large</option>
                  <option value="extra-large">Extra Large</option>
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:items-start">
                <div className="space-y-1">
                  <Label>Contrast</Label>
                  <p className="text-sm text-muted-foreground">
                    Strengthens borders, secondary text, and keyboard focus
                    indicators.
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <ChoiceButton
                    active={preferences.contrast === "standard"}
                    onClick={() =>
                      savePreferences({ ...preferences, contrast: "standard" })
                    }
                  >
                    Standard
                  </ChoiceButton>
                  <ChoiceButton
                    active={preferences.contrast === "high"}
                    onClick={() =>
                      savePreferences({ ...preferences, contrast: "high" })
                    }
                  >
                    High Contrast
                  </ChoiceButton>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Settings are saved to your account and apply immediately.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={resetAll}
            className="w-full sm:w-auto"
          >
            <RotateCcw className="size-4" />
            Reset All Settings
          </Button>
        </div>
      </div>
    </div>
  )
}
