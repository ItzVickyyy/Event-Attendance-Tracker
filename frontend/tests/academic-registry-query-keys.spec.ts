import { expect, test } from "@playwright/test"
import { sectionStudentMutationQueryKeys } from "../src/lib/academicRegistryQueryKeys"

test("section student mutations invalidate only the affected section and academic year", () => {
  expect(sectionStudentMutationQueryKeys("section-1", "year-1")).toEqual([
    ["academicRegistryRoster", "section-1"],
    ["academicRegistrySections", "year-1"],
  ])
})
