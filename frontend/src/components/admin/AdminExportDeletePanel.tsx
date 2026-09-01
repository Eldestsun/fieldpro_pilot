import { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import {
    requestExport,
    downloadExport,
    executeDelete,
    ExportDeleteApiError,
    type ExportRequestResponse,
    type ExecuteDeleteResponse,
} from "../../api/exportDelete";
import { OpsLayout } from "../ui/OpsLayout";
import { OpsButton } from "../ui/OpsButton";

// LABOR SAFETY (T1-A6): this panel surfaces only expires_at, the per-table
// deletion_summary, and the confirmation_token. No worker identity crosses
// this surface — the bundle's sidecar identity fields stay inside the
// downloaded archive, which is served opaque (gzip blob) by the backend.

type Step = 1 | 2 | 3;

function apiErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof ExportDeleteApiError) {
        if (err.status === 401 || err.status === 403) return "Not authorized.";
        if (err.status === 410) return "Confirmation token expired, request a new export bundle.";
        if (err.status === 409) return "Confirmation token has already been consumed. Request a new export bundle.";
        return err.message;
    }
    return err instanceof Error ? err.message : fallback;
}

const IRREVERSIBILITY_WARNING =
    "This will permanently delete all canonical data for this organization — " +
    "locations, assignments, visits, observations, evidence, stop history, EAM " +
    "bridge logs — and the audit log itself. The export.delete_execute event is " +
    "recorded in the transaction and then purged with the rest; its counts are " +
    "returned in the deletion summary. The only surviving copy of this " +
    "organization's data, including its audit trail, is the export bundle you " +
    "downloaded. This action is irreversible.";

function StepBadge({ n, active, done }: { n: number; active: boolean; done: boolean }) {
    const cls = done
        ? "bg-green-600 text-white"
        : active
            ? "bg-blue-700 text-white"
            : "bg-gray-200 text-gray-500";
    return (
        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-semibold shrink-0 ${cls}`}>
            {done ? "✓" : n}
        </span>
    );
}

export function AdminExportDeletePanel() {
    const { getAccessToken } = useAuth();

    const [step, setStep] = useState<Step>(1);
    const [error, setError] = useState<string | null>(null);

    // Step 1 state
    const [exportResult, setExportResult] = useState<ExportRequestResponse | null>(null);
    const [isRequesting, setIsRequesting] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [hasDownloaded, setHasDownloaded] = useState(false);

    // Step 2 state
    const [copied, setCopied] = useState(false);

    // Step 3 state
    const [pastedToken, setPastedToken] = useState("");
    const [ackChecked, setAckChecked] = useState(false);
    const [isExecuting, setIsExecuting] = useState(false);
    const [deleteResult, setDeleteResult] = useState<ExecuteDeleteResponse | null>(null);

    const handleRequest = async () => {
        setIsRequesting(true);
        setError(null);
        try {
            const token = await getAccessToken();
            const result = await requestExport(token);
            setExportResult(result);
            setHasDownloaded(false);
        } catch (err) {
            setError(apiErrorMessage(err, "Failed to request export bundle"));
        } finally {
            setIsRequesting(false);
        }
    };

    const handleDownload = async () => {
        if (!exportResult) return;
        setIsDownloading(true);
        setError(null);
        try {
            const token = await getAccessToken();
            await downloadExport(token, exportResult.export_path);
            setHasDownloaded(true);
        } catch (err) {
            setError(apiErrorMessage(err, "Failed to download export bundle"));
        } finally {
            setIsDownloading(false);
        }
    };

    const handleCopyToken = async () => {
        if (!exportResult) return;
        try {
            await navigator.clipboard.writeText(exportResult.confirmation_token);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard unavailable (permissions / insecure context) — the token
            // is visible in the field and can be selected manually.
        }
    };

    const handleExecute = async () => {
        if (!exportResult || !canExecute) return;
        setIsExecuting(true);
        setError(null);
        try {
            const token = await getAccessToken();
            const result = await executeDelete(token, exportResult.confirmation_token);
            setDeleteResult(result);
        } catch (err) {
            setError(apiErrorMessage(err, "Failed to execute deletion"));
        } finally {
            setIsExecuting(false);
        }
    };

    const tokenMatches =
        exportResult !== null && pastedToken.trim() === exportResult.confirmation_token;
    const canExecute = tokenMatches && ackChecked && !isExecuting && deleteResult === null;

    const summaryRows = deleteResult
        ? Object.entries(deleteResult.deletion_summary)
        : [];

    return (
        <OpsLayout
            title="Export & Delete"
            subtitle="Data subject rights flow: export this organization's data, then permanently delete it. The execute step is irreversible."
        >
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-6 text-sm" role="alert">
                    {error}
                </div>
            )}

            {/* ── Step 1 — Request export ─────────────────────────────────── */}
            <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-5 mb-4" aria-labelledby="ed-step1">
                <div className="flex items-center gap-3 mb-3">
                    <StepBadge n={1} active={step === 1} done={step > 1} />
                    <h2 id="ed-step1" className="text-base font-semibold text-gray-900">Request export bundle</h2>
                </div>
                {step === 1 && (
                    <div className="pl-10">
                        <p className="text-sm text-gray-600 mb-4">
                            Generates a full export of this organization's data as a gzipped
                            JSON bundle and issues a one-time confirmation token.
                        </p>
                        {!exportResult ? (
                            <OpsButton onClick={handleRequest} disabled={isRequesting}>
                                {isRequesting ? "Requesting…" : "Request export bundle"}
                            </OpsButton>
                        ) : (
                            <div className="flex flex-col gap-3 items-start">
                                <p className="text-sm text-gray-700">
                                    Bundle ready. Confirmation token expires{" "}
                                    <span className="font-semibold whitespace-nowrap">
                                        {new Date(exportResult.expires_at).toLocaleString()}
                                    </span>.
                                </p>
                                <div className="flex gap-3 flex-wrap">
                                    <OpsButton
                                        variant="secondary"
                                        onClick={handleDownload}
                                        disabled={isDownloading}
                                    >
                                        {isDownloading
                                            ? "Downloading…"
                                            : hasDownloaded
                                                ? "Download again"
                                                : "Download bundle"}
                                    </OpsButton>
                                    <OpsButton onClick={() => setStep(2)} disabled={!hasDownloaded}>
                                        Continue to review
                                    </OpsButton>
                                </div>
                                {!hasDownloaded && (
                                    <p className="text-xs text-gray-500">
                                        Download the bundle before continuing — after deletion it is
                                        the only copy of this organization's data.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </section>

            {/* ── Step 2 — Review ─────────────────────────────────────────── */}
            <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-5 mb-4" aria-labelledby="ed-step2">
                <div className="flex items-center gap-3 mb-3">
                    <StepBadge n={2} active={step === 2} done={step > 2} />
                    <h2 id="ed-step2" className="text-base font-semibold text-gray-900">Review</h2>
                </div>
                {step === 2 && exportResult && (
                    <div className="pl-10">
                        <label htmlFor="ed-token" className="block text-sm font-semibold text-gray-700 mb-1">
                            Confirmation token
                        </label>
                        <div className="flex gap-2 items-stretch mb-4 max-w-2xl">
                            <input
                                id="ed-token"
                                type="text"
                                readOnly
                                value={exportResult.confirmation_token}
                                className="flex-1 px-3 py-2 rounded-md border border-gray-300 text-xs font-mono bg-gray-50 text-gray-800 min-h-[44px]"
                            />
                            <OpsButton variant="secondary" onClick={handleCopyToken}>
                                {copied ? "Copied" : "Copy"}
                            </OpsButton>
                        </div>
                        <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-lg px-4 py-3 mb-4 text-sm leading-relaxed">
                            {IRREVERSIBILITY_WARNING}
                        </div>
                        <OpsButton onClick={() => setStep(3)}>
                            Proceed to execute
                        </OpsButton>
                    </div>
                )}
            </section>

            {/* ── Step 3 — Execute deletion ───────────────────────────────── */}
            <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-5" aria-labelledby="ed-step3">
                <div className="flex items-center gap-3 mb-3">
                    <StepBadge n={3} active={step === 3} done={deleteResult !== null} />
                    <h2 id="ed-step3" className="text-base font-semibold text-gray-900">Execute deletion</h2>
                </div>
                {step === 3 && exportResult && !deleteResult && (
                    <div className="pl-10">
                        <label htmlFor="ed-paste" className="block text-sm font-semibold text-gray-700 mb-1">
                            Paste the confirmation token to confirm
                        </label>
                        <input
                            id="ed-paste"
                            type="text"
                            value={pastedToken}
                            onChange={e => setPastedToken(e.target.value)}
                            placeholder="Paste confirmation token"
                            className="w-full max-w-2xl px-3 py-2 rounded-md border border-gray-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-red-500 min-h-[44px] mb-1"
                        />
                        {pastedToken.length > 0 && !tokenMatches && (
                            <p className="text-xs text-red-600 mb-2">Token does not match.</p>
                        )}
                        <label className="flex items-start gap-2 my-4 text-sm text-gray-800 max-w-2xl cursor-pointer">
                            <input
                                type="checkbox"
                                checked={ackChecked}
                                onChange={e => setAckChecked(e.target.checked)}
                                className="mt-0.5 w-4 h-4 shrink-0 accent-red-600"
                            />
                            <span>I understand this is irreversible</span>
                        </label>
                        <OpsButton variant="danger" onClick={handleExecute} disabled={!canExecute}>
                            {isExecuting ? "Executing…" : "Execute deletion"}
                        </OpsButton>
                    </div>
                )}
                {deleteResult && (
                    <div className="pl-10">
                        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm text-red-800 font-medium">
                            Deletion complete. This page is now showing residual UI state;
                            sign out to re-verify.
                        </div>
                        <p className="text-sm text-gray-600 mb-2">
                            Executed at{" "}
                            <span className="font-semibold whitespace-nowrap">
                                {new Date(deleteResult.executed_at).toLocaleString()}
                            </span>
                        </p>
                        <table className="text-sm border border-gray-200 rounded-lg overflow-hidden">
                            <thead>
                                <tr className="bg-gray-50 text-left">
                                    <th className="px-4 py-2 font-semibold text-gray-700">Table</th>
                                    <th className="px-4 py-2 font-semibold text-gray-700 text-right">Rows deleted</th>
                                </tr>
                            </thead>
                            <tbody>
                                {summaryRows.map(([table, count]) => (
                                    <tr key={table} className="border-t border-gray-100">
                                        <td className="px-4 py-2 font-mono text-xs text-gray-700">{table}</td>
                                        <td className="px-4 py-2 text-right text-gray-900">{count}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </OpsLayout>
    );
}
