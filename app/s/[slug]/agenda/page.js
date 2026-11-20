import SharedAgenda from '@/app/components/booking/SharedAgenda'
import { isCalendarDate } from '@/lib/booking/dates'

export const metadata = {
  title: 'Agenda | webFácil',
  robots: { index: false, follow: false },
}

export default function Page({ params, searchParams }) {
  return <SharedAgenda
    slug={params.slug}
    view={searchParams.view === 'booked' ? 'booked' : 'available'}
    period={searchParams.period === 'month' ? 'month' : 'day'}
    date={isCalendarDate(searchParams.date) ? searchParams.date : ''}
  />
}
