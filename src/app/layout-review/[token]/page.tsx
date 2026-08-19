import { LayoutReviewPage } from '@/components/layout-review/LayoutReviewPage'

export default async function LayoutReviewRoute({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <LayoutReviewPage token={token} />
}
