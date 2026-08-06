export function formatCredentialDate(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' }).format(new Date(value))
}
