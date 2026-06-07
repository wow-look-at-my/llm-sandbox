export function isProviderQueryKey(queryKey: readonly unknown[]) {
  return queryKey[1] === "providers"
}
