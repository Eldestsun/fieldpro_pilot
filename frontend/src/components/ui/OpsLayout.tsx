import type { ReactNode } from "react";

interface OpsLayoutProps {
    title: string;
    subtitle?: string;
    rightActions?: ReactNode;
    children: ReactNode;
}

export function OpsLayout({ title, subtitle, rightActions, children }: OpsLayoutProps) {
    return (
        <div style={{ minHeight: "100vh", backgroundColor: "#f8fafc", padding: "2rem 1rem" }}>
            <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
                <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem" }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: "1.875rem", fontWeight: 700, color: "#1a202c" }}>{title}</h1>
                        {subtitle && <p style={{ margin: "0.5rem 0 0", color: "#718096", fontSize: "1rem" }}>{subtitle}</p>}
                    </div>
                    {rightActions && <div style={{ display: "flex", gap: "0.75rem" }}>{rightActions}</div>}
                </header>
                <main>{children}</main>
            </div>
        </div>
    );
}
