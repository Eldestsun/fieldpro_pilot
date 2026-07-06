/**
 * T1-A5 guard test — proves the LOCAL RequireRole defined in App.tsx (the
 * redirecting guard the routes actually use, NOT src/auth/RequireRole.tsx)
 * bounces non-Admin roles off /admin/audit-log. A Dispatch dev-bypass token
 * must never reach the audit log surface (labor safety: actor_oid is
 * Admin-only per planning/security/ADMIN_ACCESS_POLICY.md).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { useAuth } from '../auth/AuthContext'

vi.mock('../auth/AuthContext', () => ({
  useAuth: vi.fn(),
}))

// Stub every routed surface so the test exercises ONLY App's routing + guard.
vi.mock('../components/TodayRouteView', () => ({
  TodayRouteView: () => <div data-testid="today-route-view" />,
}))
vi.mock('../components/LeadRoutesPanel', () => ({
  LeadRoutesPanel: () => <div data-testid="lead-routes-panel" />,
}))
vi.mock('../components/LeadRouteDetail', () => ({
  LeadRouteDetail: () => <div data-testid="lead-route-detail" />,
}))
vi.mock('../components/admin/AdminDashboard', () => ({
  AdminDashboard: () => <div data-testid="admin-dashboard" />,
}))
vi.mock('../components/admin/AdminPoolsPanel', () => ({
  AdminPoolsPanel: () => <div data-testid="admin-pools-panel" />,
}))
vi.mock('../components/admin/AdminStopsPanel', () => ({
  AdminStopsPanel: () => <div data-testid="admin-stops-panel" />,
}))
vi.mock('../components/admin/AdminControlCenter', () => ({
  AdminControlCenter: () => <div data-testid="admin-control-center" />,
}))
vi.mock('../components/admin/AdminAuditLogPanel', () => ({
  AdminAuditLogPanel: () => <div data-testid="admin-audit-log-panel" />,
}))
vi.mock('../auth/LoginPage', () => ({
  LoginPage: () => <div data-testid="login-page" />,
}))
vi.mock('../offline/OfflineSyncManager', () => ({
  OfflineSyncManager: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}))
vi.mock('../components/ui/OfflineStatusBar', () => ({
  OfflineStatusBar: () => null,
}))

function renderAt(path: string, roles: string[]) {
  vi.mocked(useAuth).mockReturnValue({
    isSignedIn: true,
    isLoading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    me: { roles, user: { name: 'Test User' } },
    getAccessToken: vi.fn().mockResolvedValue('test-token'),
  } as unknown as ReturnType<typeof useAuth>)

  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

describe('App /admin/audit-log guard (local RequireRole)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('bounces a Dispatch (dev-bypass) token: redirected away, panel never renders', () => {
    renderAt('/admin/audit-log', ['Dispatch'])

    expect(screen.queryByTestId('admin-audit-log-panel')).not.toBeInTheDocument()
    // RequireRole redirects to "/" → DefaultRedirect sends Dispatch to /routes
    expect(screen.getByTestId('lead-routes-panel')).toBeInTheDocument()
  })

  it('bounces a Specialist token: redirected to /work, panel never renders', () => {
    renderAt('/admin/audit-log', ['Specialist'])

    expect(screen.queryByTestId('admin-audit-log-panel')).not.toBeInTheDocument()
    expect(screen.getByTestId('today-route-view')).toBeInTheDocument()
  })

  it('renders the panel for an Admin token', () => {
    renderAt('/admin/audit-log', ['Admin'])

    expect(screen.getByTestId('admin-audit-log-panel')).toBeInTheDocument()
  })

  it('shows the Audit Log nav entry to Admin only', () => {
    renderAt('/admin/dashboard', ['Admin'])
    expect(screen.getByRole('link', { name: 'Audit Log' })).toBeInTheDocument()
  })

  it('hides the Audit Log nav entry from Dispatch', () => {
    renderAt('/routes', ['Dispatch'])
    expect(screen.queryByRole('link', { name: 'Audit Log' })).not.toBeInTheDocument()
  })
})
