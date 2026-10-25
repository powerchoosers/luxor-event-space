import { PortalLoading } from '@/components/LuxorLoading'

export default function Loading() {
  return <PortalLoading />
}
;(Loading as unknown as { isLuxorLoading?: boolean }).isLuxorLoading = true
