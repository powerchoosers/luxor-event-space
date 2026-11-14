import { redirect } from 'next/navigation'

export default function AccountantExportsRedirectPage() {
  redirect('/portal/finances/books#exports')
}
