import type { PropsWithChildren } from "react";

export function UlLayout({ children }: PropsWithChildren) {
  return (
    <div className="max-w-xl mx-auto px-4 pb-24">
      {children}
    </div>
  );
}
