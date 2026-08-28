/** Provider acceptance and recipient-server delivery are deliberately distinct. */
export function luxorMailDeliveryLabel(status?: string) {
  const labels: Record<string, string> = {
    prepared: 'Waiting to send', queued: 'Queued', scheduled: 'Scheduled', sending: 'Sending',
    send_unconfirmed: 'Delivery unconfirmed — needs review', sent: 'Accepted for delivery',
    delivery_delayed: 'Delivery delayed', delivered: 'Delivered', opened: 'Delivered · open reported',
    clicked: 'Delivered · click reported', failed: 'Delivery failed', bounced: 'Bounced',
    suppressed: 'Not sent · suppressed', complained: 'Spam complaint reported',
    cancelled: 'Cancelled', canceled: 'Cancelled',
    imported: 'Imported from Zoho',
  }
  return status ? labels[status] || 'Delivery status unavailable' : ''
}
