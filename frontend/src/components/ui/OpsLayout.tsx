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
        <div className="min-h-screen bg-(--surface-app) px-4 py-8">
            <div className="max-w-5xl mx-auto">
                <header className="flex justify-between items-start mb-8">
                    <div className="flex gap-4 items-start">
                        {onBack && (
                            <button
                                onClick={onBack}
                                className="mt-1 bg-(--surface-card) border border-(--border-default) rounded-md px-3 py-1 cursor-pointer text-(--gray-600) text-sm font-medium min-h-[44px] flex items-center hover:bg-(--gray-50) transition-colors"
                            >
                                ← Back
                            </button>
                        )}
                        <div>
                            <h1 className="m-0 text-3xl font-bold text-(--text-heading)">{title}</h1>
                            {subtitle && <p className="mt-2 mb-0 text-(--text-muted) text-base">{subtitle}</p>}
                        </div>
                    </div>
                    {rightActions && <div className="flex gap-3">{rightActions}</div>}
                </header>
                <main>{children}</main>
            </div>
        </div>
    );
}
