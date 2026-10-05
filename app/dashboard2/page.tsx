import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { GeorgeDashboardClient } from '@/components/george-dashboard/george-dashboard-client'
import { ACCESS_COOKIE, getAccessEnabled } from '@/lib/access-flow'
import { getActiveAccessSession } from '@/lib/access-session'

export default async function Dashboard2Page() {
  if (getAccessEnabled()) {
    const jar = await cookies()
    const token = jar.get(ACCESS_COOKIE)?.value
    if (!token) {
      redirect('/welcome')
    }
    const session = await getActiveAccessSession(token)
    if (!session) {
      // Clear cookie via logout route (Server Components cannot mutate cookies).
      redirect('/api/access/logout')
    }
  }

  return <GeorgeDashboardClient variant="dark" />
}