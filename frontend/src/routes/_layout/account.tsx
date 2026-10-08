import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout/account")({
  component: Account,
  head: () => ({ meta: [{ title: "My Account - Event Attendance Tracker" }] }),
})

function Account() {
  const { user } = useAuth()
  const client = useQueryClient()
  const query = useQuery({
    queryKey: ["my-account"],
    queryFn: async () =>
      (
        await fetch("/api/v1/users/me", {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("access_token")}`,
          },
        })
      ).json(),
  })
  const profile = query.data ?? user
  const [firstName, setFirstName] = useState("")
  const [middleName, setMiddleName] = useState("")
  const [lastName, setLastName] = useState("")
  const [nameExtension, setNameExtension] = useState("")
  const [email, setEmail] = useState("")
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  useEffect(() => {
    if (!profile) return
    const fullName = String(profile.full_name ?? "").trim()
    const parts = fullName ? fullName.split(/\s+/) : []
    setFirstName(profile.first_name ?? (parts.length > 1 ? parts[0] : ""))
    setMiddleName(
      profile.middle_name ??
        (parts.length > 2 ? parts.slice(1, -1).join(" ") : ""),
    )
    setLastName(
      profile.last_name ?? (parts.length > 1 ? parts[parts.length - 1] : ""),
    )
    setNameExtension(profile.name_extension ?? "")
    setEmail(profile.email ?? "")
  }, [profile])

  const saveProfile = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("First name and last name are required")
      return
    }
    const response = await fetch("/api/v1/users/me", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        first_name: firstName.trim(),
        middle_name: middleName.trim() || null,
        last_name: lastName.trim(),
        name_extension: nameExtension.trim() || null,
        email,
      }),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      toast.error(body?.detail ?? "Unable to update account")
      return
    }
    toast.success("Account updated")
    await client.invalidateQueries({ queryKey: ["currentUser"] })
    await client.invalidateQueries({ queryKey: ["my-account"] })
  }
  const changePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match")
      return
    }
    const response = await fetch("/api/v1/users/me/password", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      toast.error(body?.detail ?? "Unable to change password")
      return
    }
    toast.success("Password changed")
    setCurrentPassword("")
    setNewPassword("")
    setConfirmPassword("")
    await client.invalidateQueries({ queryKey: ["currentUser"] })
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My Account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Update your personal information and password.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="first-name">First Name</Label>
              <Input
                id="first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="middle-name">Middle Name</Label>
              <Input
                id="middle-name"
                value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last-name">Last Name</Label>
              <Input
                id="last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name-extension">
                Extension{" "}
                <span className="text-muted-foreground">(Optional)</span>
              </Label>
              <Input
                id="name-extension"
                value={nameExtension}
                onChange={(e) => setNameExtension(e.target.value)}
                placeholder="Jr., Sr., III"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="account-email">Email</Label>
            <Input
              id="account-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button onClick={() => void saveProfile()}>Save changes</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <Button onClick={() => void changePassword()}>Change password</Button>
        </CardContent>
      </Card>
    </div>
  )
}
