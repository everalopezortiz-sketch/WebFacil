import { permanentRedirect } from 'next/navigation'

// Legacy route kept for backwards compatibility.
// Canonical public URL is now /s/[slug].
export default function LegacyStoreRedirect({ params }) {
  permanentRedirect(`/s/${params.slug}`)
}
