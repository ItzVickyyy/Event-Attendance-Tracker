import { expect, test } from "@playwright/test"
import { classRepresentativeStudentRelatedQueryKeys } from "../src/lib/studentQueryKeys"

test("class representative student mutations invalidate only related student views", () => {
  expect(classRepresentativeStudentRelatedQueryKeys()).toEqual([
    ["class-representative-students"],
    ["academicRegistryRoster"],
    ["academicRegistrySections"],
  ])
})
