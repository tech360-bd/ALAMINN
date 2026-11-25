import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * Tracks whether the viewport is below the mobile breakpoint.
 *
 * Implemented with useSyncExternalStore so the media-query subscription is a
 * true external store: no synchronous setState inside an effect (which the
 * React Compiler flags as a cascading-render hazard) and a stable
 * server-side snapshot of `false` to keep SSR/client markup consistent.
 */
export function useIsMobile() {
  const subscribe = React.useCallback((onChange: () => void) => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return React.useSyncExternalStore(
    subscribe,
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false,
  )
}
