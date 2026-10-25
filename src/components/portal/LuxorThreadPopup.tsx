'use client'

import React from 'react'
import { LuxorDraggableTextModal } from './LuxorDraggableTextModal'

export function LuxorThreadPopup({
  inquiryId,
  phone,
  contactName,
  onClose,
}: {
  inquiryId?: string
  phone: string
  contactName?: string
  onClose: () => void
}) {
  return (
    <LuxorDraggableTextModal
      inquiryId={inquiryId}
      phone={phone}
      contactName={contactName}
      onClose={onClose}
    />
  )
}
