import { cn } from "../../lib/utils";
import type { ReactNode } from "react";

interface OpsCardProps {
    children: ReactNode;
    className?: string;
}

export function OpsCard({ children, className }: OpsCardProps) {
    return (
        <div className={cn("bg-white border border-gray-200 rounded-lg shadow-sm p-6", className)}>
            {children}
        </div>
    );
}
