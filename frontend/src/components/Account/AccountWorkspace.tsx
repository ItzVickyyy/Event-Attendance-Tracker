import { Link } from "@tanstack/react-router"
import { LogOut, Shield, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import UserInformation from "@/components/UserSettings/UserInformation"
import ChangePassword from "@/components/UserSettings/ChangePassword"
import useAuth from "@/hooks/useAuth"

export function AccountWorkspace({ section = "profile" }: { section?: "profile" | "security" }) {
  const { logout } = useAuth()
  return <div className="space-y-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-2xl font-semibold tracking-tight">My Account</h1><p className="text-sm text-muted-foreground">Manage your profile and account security.</p></div><Button variant="outline" onClick={logout}><LogOut />Logout</Button></div><div className="flex gap-2"><Button variant={section === "profile" ? "default" : "outline"} asChild><Link to="/account/profile"><UserRound />Profile</Link></Button><Button variant={section === "security" ? "default" : "outline"} asChild><Link to="/account/security"><Shield />Security</Link></Button></div><Card><CardHeader><CardTitle className="text-base">{section === "profile" ? "Profile" : "Security"}</CardTitle></CardHeader><CardContent>{section === "profile" ? <UserInformation /> : <ChangePassword />}</CardContent></Card></div>
}
