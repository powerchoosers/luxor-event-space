import VendorBillsProfile from '@/components/portal/VendorBillsProfile'

export default async function VendorBillsPage({ params }: { params: Promise<{ id: string }> }) {
  return <VendorBillsProfile vendorId={(await params).id} />
}
