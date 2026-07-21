import { cn } from "../../lib/utils";
import type { ReactNode } from "react";

interface OpsCardProps {
    children: ReactNode;
    className?: string;
}

export function OpsCard({ children, className }: OpsCardProps) {
    return (
        <div className={cn("bg-(--surface-card) border border-(--border-default) rounded-lg shadow-(--shadow-card) p-6", className)}>
            {children}
        </div>
    );
}
