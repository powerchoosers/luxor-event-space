declare module 'web-push' {
  export type PushSubscription = {
    endpoint: string
    expirationTime?: number | null
    keys: {
      p256dh: string
      auth: string
    }
  }

  export type SendResult = {
    statusCode: number
    headers: Record<string, string | string[] | undefined>
    body: string
  }

  export type WebPushError = Error & {
    statusCode?: number
    body?: string
  }

  const webPush: {
    sendNotification(
      subscription: PushSubscription,
      payload: string,
      options: {
        TTL?: number
        urgency?: 'very-low' | 'low' | 'normal' | 'high'
        topic?: string
        vapidDetails: {
          subject: string
          publicKey: string
          privateKey: string
        }
      },
    ): Promise<SendResult>
  }

  export default webPush
}
