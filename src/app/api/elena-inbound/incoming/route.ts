import { handleElenaLiveIncoming } from '@/lib/luxorElenaInboundServer'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15
export const POST = handleElenaLiveIncoming
