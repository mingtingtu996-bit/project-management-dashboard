export const RESERVED_PROJECT_ROUTE_IDS = new Set(['new'])

export function isReservedProjectRouteId(value: string | null | undefined) {
  return Boolean(value && RESERVED_PROJECT_ROUTE_IDS.has(value.toLowerCase()))
}

export function getRouteProjectId(pathname: string) {
  const routeProjectId = pathname.match(/^\/projects\/([^/]+)/)?.[1] ?? null
  return isReservedProjectRouteId(routeProjectId) ? null : routeProjectId
}

export function isProjectRoutePath(pathname: string) {
  return Boolean(getRouteProjectId(pathname))
}

export function isReservedProjectRoutePath(pathname: string) {
  const routeProjectId = pathname.match(/^\/projects\/([^/]+)/)?.[1] ?? null
  return isReservedProjectRouteId(routeProjectId)
}
