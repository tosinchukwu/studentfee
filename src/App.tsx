import { useNear } from './lib/near'
import { usePath } from './lib/router'
import AdminPage from './pages/AdminPage'
import HomePage from './pages/HomePage'
import PayPage from './pages/PayPage'
import ParentPage from './pages/ParentPage'
import { Card, Notice, PageShell, Spinner } from './components/ui'

export default function App() {
  const { config, loadError } = useNear()
  const path = usePath()

  if (loadError) {
    return (
      <PageShell schoolName="School fees">
        <Card className="mx-auto max-w-md">
          <Notice tone="error">The app could not start: {loadError}</Notice>
        </Card>
      </PageShell>
    )
  }
  if (!config) {
    return (
      <PageShell schoolName="School fees">
        <Spinner label="Loading" />
      </PageShell>
    )
  }

  const pay = /^\/pay\/([0-9a-f]{32})\/?$/.exec(path)
  if (pay) return <PayPage id={pay[1]} />
  if (path === '/parent' || path.startsWith('/parent/')) return <ParentPage />
  if (path.startsWith('/admin')) return <AdminPage />
  return <HomePage schoolName={config.schoolName} />
}
