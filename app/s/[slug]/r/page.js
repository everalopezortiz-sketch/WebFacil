import StorePage from '@/app/components/StorePage'

// Direct booking flow: /s/[slug]/r opens the reservation flow automatically.
export default function Page({ params }) {
  return <StorePage slug={params.slug} autoBooking />
}
