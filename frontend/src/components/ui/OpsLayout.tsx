import type { ReactNode } from "react";

interface OpsLayoutProps {
    title: string;
    subtitle?: string;
    rightActions?: ReactNode;
    children: ReactNode;
    onBack?: () => void;
}

export function OpsLayout({ title, subtitle, rightActions, children, onBack }: OpsLayoutProps) {
    return (
        <div style={{ minHeight: "100vh", backgroundColor: "#f8fafc", padding: "2rem 1rem" }}>
            <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
                <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem" }}>
                    <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
                        {onBack && (
                            <button
                                onClick={onBack}
                                style={{
                                    marginTop: "0.25rem",
                                    background: "white",
                                    border: "1px solid #e2e8f0",
                                    borderRadius: "0.375rem",
                                    padding: "0.25rem 0.75rem",
                                    cursor: "pointer",
                                    color: "#4a5568",
                                    fontSize: "0.875rem",
                                    fontWeight: 500,
                                }}
                            >
                                ← Back
                            </button>
                        )}
                        <div>
                            <h1 style={{ margin: 0, fontSize: "1.875rem", fontWeight: 700, color: "#1a202c" }}>{title}</h1>
                            {subtitle && <p style={{ margin: "0.5rem 0 0", color: "#718096", fontSize: "1rem" }}>{subtitle}</p>}
                        </div>
                    </div>
                    {rightActions && <div style={{ display: "flex", gap: "0.75rem" }}>{rightActions}</div>}
                </header>
                <main>{children}</main>
            </div>
        </div>
    );
}
