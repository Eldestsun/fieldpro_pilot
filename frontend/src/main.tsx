import { createRoot } from "react-dom/client";
import { PublicClientApplication } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import App from "./App";
import { msalConfig } from "./msalConfig";
import { AuthProvider } from "./auth/AuthContext";

const pca = new PublicClientApplication(msalConfig);

createRoot(document.getElementById("root")!).render(
  <MsalProvider instance={pca}>
    <AuthProvider>
      <App />
    </AuthProvider>
  </MsalProvider>
);
