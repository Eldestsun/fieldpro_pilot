import React, { type PropsWithChildren } from "react";

export const UlLayout: React.FC<PropsWithChildren> = ({ children }) => (
    <main
        style={{
            maxWidth: "960px",      // ≈ max-w-4xl
            margin: "0 auto",
            padding: "24px 16px",
        }}
    >
        {children}
    </main>
);
