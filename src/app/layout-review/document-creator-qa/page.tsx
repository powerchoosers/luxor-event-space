import { DocumentCreatorQaHarness } from './DocumentCreatorQaHarness'

export default function DocumentCreatorQaPage() {
  if (process.env.NODE_ENV === 'production') {
    return <p className="p-6 text-sm text-[#bdb2a4]">This QA harness is available in development builds only.</p>
  }
  return <DocumentCreatorQaHarness />
}