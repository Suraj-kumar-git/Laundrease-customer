// Shared display formatter for rounded platform stat counters (e.g. "12K+", "87+").
export function formatStat(n: number): string {
  if (n >= 100000) return `${Math.floor(n / 1000)}K+`
  if (n >= 1000)   return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K+`
  if (n === 0)     return '—'
  return `${n}+`
}
