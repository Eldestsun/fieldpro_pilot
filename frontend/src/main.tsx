import { createRoot } from "react-dom/client";
import { PublicClientApplication } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import App from "./App";
import { msalConfig } from "./msalConfig";
import { AuthProvider } from "./auth/AuthContext";
import "./index.css";

let pca: PublicClientApplication | null = null;
let msalError: Error | null = null;

try {
  pca = new PublicClientApplication(msalConfig);
} catch (err: any) {
  console.error("MSAL Initialization Failed:", err);
  msalError = err;
}

import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: "red" }}>
          <h1>Something went wrong.</h1>
          <pre>{this.state.error?.toString()}</pre>
        </div>
      );
    }

    return this.props.children;
  }
}

const root = createRoot(document.getElementById("root")!);

if (msalError || !pca) {
  root.render(
    <div style={{ padding: 20, color: "red" }}>
      <h1>Application Configuration Error</h1>
      <p>Failed to initialize authentication. Please check your environment variables.</p>
      <pre>{msalError?.toString() || "Unknown MSAL error"}</pre>
    </div>
  );
} else {
  root.render(
    <ErrorBoundary>
      <MsalProvider instance={pca}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MsalProvider>
    </ErrorBoundary>
  );
}
