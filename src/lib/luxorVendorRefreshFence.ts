/** Invalidates responses started before a newer refresh, save, or unmount. */
export function createVendorRefreshFence() {
  let generation = 0
  return { begin: () => ++generation, isCurrent: (value: number) => value === generation, invalidate: () => { generation++ } }
}
