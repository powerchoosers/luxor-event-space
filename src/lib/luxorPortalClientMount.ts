const subscribeNoop = () => () => {}

const CLIENT_MOUNTED_SNAPSHOT = true
const SERVER_MOUNTED_SNAPSHOT = false

export function subscribePortalClientMounted() {
  return subscribeNoop()
}

export function getPortalClientMountedSnapshot() {
  return CLIENT_MOUNTED_SNAPSHOT
}

export function getPortalClientMountedServerSnapshot() {
  return SERVER_MOUNTED_SNAPSHOT
}