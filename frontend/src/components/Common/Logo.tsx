import { Link } from "@tanstack/react-router"

import { cn } from "@/lib/utils"

const logo = "/assets/images/CCS-SC_Logo_Maroon.webp"

interface LogoProps {
  variant?: "full" | "icon" | "responsive"
  className?: string
  asLink?: boolean
}

export function Logo({
  variant = "full",
  className,
  asLink = true,
}: LogoProps) {
  const content =
    variant === "responsive" ? (
      <>
        <span
          className={cn(
            "text-sm font-semibold leading-6 whitespace-nowrap group-data-[collapsible=icon]:hidden",
            className,
          )}
        >
          Event Attendance Tracker
        </span>
        <img
          src={logo}
          alt="College of Computer Studies Student Council logo"
          className={cn(
            "size-5 hidden group-data-[collapsible=icon]:block",
            className,
          )}
        />
      </>
    ) : variant === "full" ? (
      <span
        className={cn(
          "text-sm font-semibold leading-6 whitespace-nowrap",
          className,
        )}
      >
        Event Attendance Tracker
      </span>
    ) : (
      <img
        src={logo}
        alt="College of Computer Studies Student Council logo"
        className={cn("size-5", className)}
      />
    )

  if (!asLink) {
    return content
  }

  return <Link to="/">{content}</Link>
}
