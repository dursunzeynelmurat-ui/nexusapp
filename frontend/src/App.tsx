import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense, lazy, useEffect } from 'react'
import { useAuthStore } from './stores/authStore'
import { useTutorialStore } from './stores/tutorialStore'
import { Sidebar }       from './components/Sidebar'
import { ToastContainer } from './components/Toast'
import { Tutorial }      from './components/Tutorial'
import './utils/i18n'

const Login    = lazy(() => import('./pages/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Connect   = lazy(() => import('./pages/Connect'))
const Contacts  = lazy(() => import('./pages/Contacts'))
const Lists     = lazy(() => import('./pages/Lists'))
const Campaigns = lazy(() => import('./pages/Campaigns'))
const Status    = lazy(() => import('./pages/Status'))
const Settings  = lazy(() => import('./pages/Settings'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry:            1,
      refetchOnWindowFocus: false,
      staleTime:        30_000,
    },
  },
})

function ProtectedLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const user            = useAuthStore((s) => s.user)
  const openTutorial    = useTutorialStore((s) => s.open)

  useEffect(() => {
    if (!user) return
    const key = `nexus-tutorial-seen-${user.id}`
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, '1')
      openTutorial()
    }
  }, [user, openTutorial])

  if (!isAuthenticated) return <Navigate to="/login" replace />

  return (
    <div className="flex h-screen bg-primary overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <div className="h-8 w-8 rounded-full border-2 border-accent/20 border-t-accent animate-spin" />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>
      <Tutorial />
    </div>
  )
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (isAuthenticated) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Suspense fallback={null}>
                  <Login />
                </Suspense>
              </PublicRoute>
            }
          />

          <Route element={<ProtectedLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/connect"   element={<Connect />}   />
            <Route path="/contacts"  element={<Contacts />}  />
            <Route path="/lists"     element={<Lists />}     />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/status"    element={<Status />}    />
            <Route path="/settings"  element={<Settings />}  />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>

        <ToastContainer />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
