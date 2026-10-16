import { expect, test } from "@playwright/test"
import { STUDENT_SEARCH_PAGE_SIZE } from "../src/lib/studentPagination"

test("student search pagination is limited to ten results per page", () => {
  expect(STUDENT_SEARCH_PAGE_SIZE).toBe(10)
})
