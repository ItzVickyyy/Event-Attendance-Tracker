import { Shield, UserRound } from "lucide-react"
import { useState } from "react"

import ChangePassword from "@/components/UserSettings/ChangePassword"
import UserInformation from "@/components/UserSettings/UserInformation"
import { Button } from "@/components/ui/button"
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type AccountSection = "profile" | "security"

export function AccountModal() {
  const [section, setSection] = useState<AccountSection>("profile")

  return (
    <div className="space-y-5">
      <DialogHeader>
        <DialogTitle>My Account</DialogTitle>
        <DialogDescription>
          Manage your profile and account security.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-5 sm:grid-cols-[160px_minmax(0,1fr)]">
        <nav aria-label="Account sections" className="flex gap-2 sm:flex-col">
          <Button
            type="button"
            variant={section === "profile" ? "secondary" : "ghost"}
            className="justify-start"
            onClick={() => setSection("profile")}
          >
            <UserRound className="size-4" />
            Profile
          </Button>
          <Button
            type="button"
            variant={section === "security" ? "secondary" : "ghost"}
            className="justify-start"
            onClick={() => setSection("security")}
          >
            <Shield className="size-4" />
            Security
          </Button>
        </nav>
        <div className="min-w-0 rounded-lg border p-4">
          {section === "profile" ? <UserInformation /> : <ChangePassword />}
        </div>
      </div>
    </div>
  )
}
