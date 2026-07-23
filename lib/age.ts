// Shared age calculation helper — computes a player's true age from their
// date of birth, independent of whatever team/age-group they're rostered on.
export function calculateAge(
  dateOfBirth: string | null | undefined,
  asOf: Date = new Date()
): number | null {
  if (!dateOfBirth) return null
  const dob = new Date(dateOfBirth)
  if (isNaN(dob.getTime())) return null

  let age = asOf.getFullYear() - dob.getFullYear()
  const monthDiff = asOf.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && asOf.getDate() < dob.getDate())) {
    age--
  }
  return age
}
