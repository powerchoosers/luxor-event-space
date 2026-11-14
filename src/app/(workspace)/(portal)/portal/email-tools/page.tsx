import { Suspense } from 'react'
import { EmailToolsClient } from './EmailToolsClient'

export default function EmailToolsPage() {
  return <Suspense fallback={null}><EmailToolsClient /></Suspense>
}
