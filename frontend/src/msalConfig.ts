import type { Configuration } from "@azure/msal-browser";
import { LogLevel } from "@azure/msal-browser";

// Values pulled from your .env.local
const tenant = import.meta.env.VITE_AZURE_TENANT_ID!;
const clientId = import.meta.env.VITE_AZURE_CLIENT_ID!;
const redirectUri = import.meta.env.VITE_REDIRECT_URI || "http://localhost:5173";
const apiAppIdUri = import.meta.env.VITE_API_APP_ID_URI!;

export const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenant}`, // Entra tenant authority
    redirectUri,
  },
  cache: {
    cacheLocation: "localStorage", // keeps tokens after refresh
    storeAuthStateInCookie: false, // true only if you must support IE11/older Edge
  },
  system: {
    loggerOptions: { logLevel: LogLevel.Info },
  },
};

// Request both identity and API delegated scopes
export const loginRequest = {
  scopes: [
    `${apiAppIdUri}/access_as_user`, // your API’s exposed delegated scope
    "openid",
    "profile",
    "email",
  ],
};
