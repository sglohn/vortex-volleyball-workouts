// FILE: lib/teamInitial.ts
//
// Letter for a team's colored badge. Team names start with the age
// ("16 Pallavolo", "18 Storm Boys"), so skip the age and use the first letter
// of the nickname: P, S. Falls back to the first character.
export function teamInitial(name: string): string {
  const nick = name.replace(/^[\s\d\-–.]+/, '')
  return (nick.charAt(0) || name.charAt(0)).toUpperCase()
}
