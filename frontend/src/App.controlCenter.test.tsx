import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

// ============================================================================
// SEAM-B B2 — Control Center relocation, frontend.
//   - /ops/control-center renders the CC for Dispatch AND Admin (guard widened).
//   - a Specialist is bounced off /ops/control-center (fail-closed).
//   - the retired /admin/control-center path redirects to the new route.
//   - the "Control Center" nav link is Dispatch-visible (not Admin-only) and
//     points at /ops/control-center; a Specialist never sees it.
// Heavy children are stubbed to testids so we assert *which* surface mounted.
// ============================================================================

let currentRoles: string[] = []
vi.mock('./auth/AuthContext', () => ({
  useAuth: () => ({
    isSignedIn: true,
    isLoading: false,
    me: { roles: currentRoles, user: { name: 'Test User' } },
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}))

vi.mock('./components/admin/AdminControlCenter', () => ({
  AdminControlCenter: () => <div data-testid="cc" />,
}))
vi.mock('./components/TodayRouteView', () => ({ TodayRouteView: () => <div data-testid="work" /> }))
vi.mock('./components/LeadRoutesPanel', () => ({ LeadRoutesPanel: () => <div data-testid="routes" /> }))
vi.mock('./components/LeadRouteDetail', () => ({ LeadRouteDetail: () => <div data-testid="route-detail" /> }))
vi.mock('./components/admin/AdminDashboard', () => ({ AdminDashboard: () => <div data-testid="dashboard" /> }))
vi.mock('./components/admin/AdminPoolsPanel', () => ({ AdminPoolsPanel: () => <div data-testid="pools" /> }))
vi.mock('./components/admin/AdminStopsPanel', () => ({ AdminStopsPanel: () => <div data-testid="stops" /> }))
vi.mock('./auth/LoginPage', () => ({ LoginPage: () => <div data-testid="login" /> }))
vi.mock('./offline/OfflineSyncManager', () => ({ OfflineSyncManager: ({ children }: any) => <>{children}</> }))
vi.mock('./components/ui/OfflineStatusBar', () => ({ OfflineStatusBar: () => null }))

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

describe('SEAM-B B2 — /ops/control-center guard', () => {
  beforeEach(() => { currentRoles = [] })

  it('renders the Control Center for Dispatch at /ops/control-center', () => {
    currentRoles = ['Dispatch']
    renderAt('/ops/control-center')
    expect(screen.getByTestId('cc')).toBeInTheDocument()
  })

  it('renders the Control Center for Admin at /ops/control-center (access retained)', () => {
    currentRoles = ['Admin']
    renderAt('/ops/control-center')
    expect(screen.getByTestId('cc')).toBeInTheDocument()
  })

  it('bounces a Specialist off /ops/control-center (fail-closed, no CC)', () => {
    currentRoles = ['Specialist']
    renderAt('/ops/control-center')
    expect(screen.queryByTestId('cc')).not.toBeInTheDocument()
    // RequireRole → "/" → DefaultRedirect → Specialist → /work
    expect(screen.getByTestId('work')).toBeInTheDocument()
  })
})

describe('SEAM-B B2 — retired /admin/control-center redirect', () => {
  beforeEach(() => { currentRoles = [] })

  it('redirects Admin from the old /admin/control-center to the live CC', () => {
    currentRoles = ['Admin']
    renderAt('/admin/control-center')
    expect(screen.getByTestId('cc')).toBeInTheDocument()
  })

  it('redirects Dispatch from the old /admin/control-center to the live CC', () => {
    currentRoles = ['Dispatch']
    renderAt('/admin/control-center')
    expect(screen.getByTestId('cc')).toBeInTheDocument()
  })
})

describe('SEAM-B B2 — Control Center nav link per role', () => {
  beforeEach(() => { currentRoles = [] })

  it('shows a Control Center link pointing at /ops/control-center for Dispatch', () => {
    currentRoles = ['Dispatch']
    renderAt('/routes')
    const links = screen.getAllByRole('link', { name: 'Control Center' })
    expect(links.length).toBeGreaterThan(0)
    links.forEach((l) => expect(l).toHaveAttribute('href', '/ops/control-center'))
  })

  it('shows a Control Center link pointing at /ops/control-center for Admin', () => {
    currentRoles = ['Admin']
    renderAt('/admin/dashboard')
    const links = screen.getAllByRole('link', { name: 'Control Center' })
    expect(links.length).toBeGreaterThan(0)
    links.forEach((l) => expect(l).toHaveAttribute('href', '/ops/control-center'))
  })

  it('never shows a Control Center link to a Specialist', () => {
    currentRoles = ['Specialist']
    renderAt('/work')
    expect(screen.queryByRole('link', { name: 'Control Center' })).not.toBeInTheDocument()
  })
})
