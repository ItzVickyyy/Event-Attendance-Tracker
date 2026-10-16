import { expect, test } from "@playwright/test"
import {
  attendeeCredentialsQueryKey,
  attendeeIdQueryKey,
} from "../src/lib/attendeeQueryKeys"
import { requireCredentialLookupData } from "../src/lib/credentialLookup"

test("credential lookup returns data for a successful response", () => {
  const credential = {
    attendee_id: "attendee-1",
    credential_value: "8F:49:5B:74",
  }

  expect(requireCredentialLookupData({ data: credential })).toEqual(credential)
})

test("credential lookup rejects API error responses", () => {
  expect(() =>
    requireCredentialLookupData<{ attendee_id: string }>({
      error: { detail: "Credential not found" },
    }),
  ).toThrow("No credential found with this NFC UID")
})

test("credential lookup rejects responses without data", () => {
  expect(() =>
    requireCredentialLookupData<{ attendee_id: string }>({}),
  ).toThrow("No credential found with this NFC UID")
})

test("attendee lookup cache keys remain unique when reduced student rows omit person IDs", () => {
  const firstStudentKey = attendeeIdQueryKey({
    id: "student-1",
    person_id: undefined,
  })
  const secondStudentKey = attendeeIdQueryKey({
    id: "student-2",
    person_id: undefined,
  })

  expect(firstStudentKey).not.toEqual(secondStudentKey)
})

test("attendee credential cache key is shared across student views", () => {
  expect(attendeeCredentialsQueryKey("attendee-1")).toEqual([
    "attendeeCredentials",
    "attendee-1",
  ])
  expect(attendeeCredentialsQueryKey(undefined)).toEqual([
    "attendeeCredentials",
    null,
  ])
})

test("attendee lookup cache keys include student identity when person IDs match", () => {
  const firstStudentKey = attendeeIdQueryKey({
    id: "student-1",
    person_id: "person-shared",
  })
  const secondStudentKey = attendeeIdQueryKey({
    id: "student-2",
    person_id: "person-shared",
  })

  expect(firstStudentKey).not.toEqual(secondStudentKey)
})
