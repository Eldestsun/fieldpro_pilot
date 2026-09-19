import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { fetchUserDirectory, type DirectoryUser } from "../../api/routeRuns";
import { OpsLayout } from "../ui/OpsLayout";
import { OpsCard } from "../ui/OpsCard";
import { OpsTable, OpsTableRow, OpsTableCell } from "../ui/OpsTable";
import { OpsBadge } from "../ui/OpsBadge";
import { OpsButton } from "../ui/OpsButton";

// T3-A3 — read-only user directory (founder-ruled 2026-09-19).
// A mirror of who has signed into BASELINE, nothing more: no deactivation
// concept here (Entra is the only switch — a disabled Entra account cannot
// sign in or get tokens), no write paths, no per-worker activity surfaces.
// Last sign-in is DATE-ONLY: the underlying last_seen_at refreshes on every
// authenticated request, so a precise timestamp would be a movement monitor.
// The role column is a login-time cache, labeled as such — not Entra truth.
export function AdminUserDirectoryPanel() {
    const { getAccessToken } = useAuth();
    const [users, setUsers] = useState<DirectoryUser[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const token = await getAccessToken();
            setUsers(await fetchUserDirectory(token));
        } catch (err: any) {
            setError(err?.message || "Failed to load user directory");
        } finally {
            setLoading(false);
        }
    }, [getAccessToken]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const rightActions = (
        <OpsButton variant="secondary" onClick={fetchUsers} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
        </OpsButton>
    );

    return (
        <OpsLayout
            title="Users"
            subtitle="Everyone who has signed into BASELINE. Read-only — accounts are managed in Microsoft Entra."
            rightActions={rightActions}
        >
            {error && (
                <OpsCard className="mb-4">
                    <p className="text-red-600 m-0" role="alert">{error}</p>
                </OpsCard>
            )}
            <OpsCard className="p-0">
                <OpsTable headers={["Name", "Email", "Role at last sign-in", "Last sign-in"]}>
                    {(users ?? []).map((u, i) => (
                        <OpsTableRow key={`${u.email ?? u.display_name ?? "user"}-${i}`}>
                            <OpsTableCell className="font-semibold">
                                {u.display_name || <span className="text-gray-400 font-normal">Unknown</span>}
                            </OpsTableCell>
                            <OpsTableCell>{u.email || "—"}</OpsTableCell>
                            <OpsTableCell>
                                {u.role_at_last_sign_in
                                    ? <OpsBadge variant="neutral" value={u.role_at_last_sign_in} />
                                    : "—"}
                            </OpsTableCell>
                            <OpsTableCell className="tabular-nums">
                                {u.last_sign_in ? new Date(u.last_sign_in).toLocaleDateString() : "—"}
                            </OpsTableCell>
                        </OpsTableRow>
                    ))}
                    {users !== null && users.length === 0 && (
                        <OpsTableRow>
                            <OpsTableCell colSpan={4} className="text-center py-8 text-gray-500">
                                No one has signed in yet.
                            </OpsTableCell>
                        </OpsTableRow>
                    )}
                </OpsTable>
            </OpsCard>
        </OpsLayout>
    );
}
