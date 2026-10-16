export function sectionStudentMutationQueryKeys(
  sectionId: string | undefined,
  academicYearId: string | undefined,
) {
  return [
    ["academicRegistryRoster", sectionId],
    ["academicRegistrySections", academicYearId],
  ] as const
}
