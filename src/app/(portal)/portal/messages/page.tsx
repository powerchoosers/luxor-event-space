'use client'
import { MessageSquare } from 'lucide-react'
import { PortalPageFrame, PortalPageHeader } from '@/components/portal/PortalUI'
import { LuxorTextThread } from '@/components/portal/LuxorTextThread'
export default function MessagesPage() { return <PortalPageFrame><PortalPageHeader icon={<MessageSquare size={20}/>} title="Text Messages" description="Incoming and outgoing texts from the Luxor phone number. Open a lead to start a new conversation."/><LuxorTextThread/></PortalPageFrame> }
