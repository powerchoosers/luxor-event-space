import { ElenaVoiceSandbox } from '@/components/portal/ElenaVoiceSandbox'
import { requireElenaVoiceManager } from '@/lib/luxorElenaVoiceSandboxServer'
import { redirect } from 'next/navigation'

export default async function ElenaVoicePage() {
  const auth = await requireElenaVoiceManager()
  if (auth.error) redirect('/portal')
  return <ElenaVoiceSandbox />
}
