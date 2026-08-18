import StorePage from '@/app/components/StorePage'

// Canonical public storefront: /s/[slug]
export default function Page({ params }) {
  return <StorePage slug={params.slug} />
}
