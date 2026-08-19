import type { LuxorEmailJobStatus } from './luxorInquiryTypes'

export type LuxorLayoutReviewStatus = 'open' | 'approved' | 'feedback' | 'revoked' | 'expired'
export type LuxorLayoutReviewAction = 'approved' | 'feedback'

export type LayoutReviewSnapshotItem = {
  id: string
  kind: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  label: string
  seats: number
  color?: string
}

export type LayoutReviewSnapshot = {
  version: 1
  name: string
  items: LayoutReviewSnapshotItem[]
  roomWidthFeet: number
  roomHeightFeet: number
  secondaryRoomWidthFeet: number
  secondaryRoomDepthFeet: number
  updatedAt?: string
}

export type LuxorLayoutReview = {
  id: string
  created_at: string
  updated_at: string
  inquiry_id: string
  lead_event_id: string | null
  layout_name: string
  layout_snapshot: LayoutReviewSnapshot
  token_hash: string
  token_ciphertext: string
  status: LuxorLayoutReviewStatus
  created_by: string
  expires_at: string
  responded_at: string | null
  revoked_at: string | null
}

export type LuxorLayoutReviewFeedback = {
  id: string
  created_at: string
  review_id: string
  action: LuxorLayoutReviewAction
  note: string | null
  submission_key: string
  ip_hash: string | null
  user_agent: string | null
}

export type LayoutReviewEmailDelivery = {
  review_id: string
  id: string
  created_at: string
  recipient_email: string
  status: LuxorEmailJobStatus
  sent_at: string | null
  last_error: string | null
}

export type PortalLayoutReview = Omit<LuxorLayoutReview, 'token_hash' | 'token_ciphertext'> & {
  share_url: string | null
  email_delivery: LayoutReviewEmailDelivery | null
}

export type PublicLayoutReview = {
  layout_name: string
  layout_snapshot: LayoutReviewSnapshot
  status: LuxorLayoutReviewStatus
  created_at: string
  expires_at: string
  response: Pick<LuxorLayoutReviewFeedback, 'action' | 'note' | 'created_at'> | null
}
