// lib/clear-url-param.ts
// Drops a query parameter from the address bar without navigating.
//
// Deep-link params that also seed component state (?claim=<id> opening the
// item-report modal, for example) have to be cleared when that state is
// dismissed. Otherwise the param outlives the thing it opened: a refresh — or
// a link the member copied while the modal was open — re-opens a report they
// had already closed, with no way to get back to a clean list except editing
// the URL by hand.
//
// history.replaceState rather than router.replace: this only needs to correct
// the address bar. A router navigation would re-run the page and refetch the
// list purely to remove a character from the URL, and would push the user
// through a loading state for it.
export function clearUrlParam(name: string) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (!url.searchParams.has(name)) return
  url.searchParams.delete(name)
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
}
