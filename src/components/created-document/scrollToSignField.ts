export function scrollToSignField(node: HTMLDivElement | null) {
  if (!node) return
  node.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
}
