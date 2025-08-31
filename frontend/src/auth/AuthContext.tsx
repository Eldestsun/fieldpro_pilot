import { createContext, useContext, useMemo, useState, useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import type { AccountInfo, AuthenticationResult } from "@azure/msal-browser";

type Me = { ok: boolean; roles?: string[]; user?: any } | null;

type AuthCtx = {
  account: AccountInfo | null;
  isSignedIn: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string>;
  me: Me;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx | undefined>(undefined);

const basicScopes = ["openid", "profile", "email"];
const apiAppIdUri = import.meta.env.VITE_API_APP_ID_URI; // e.g. api://<API_CLIENT_ID>
const apiScopes = [`${apiAppIdUri}/access_as_user`];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { instance, accounts } = useMsal();
  const [me, setMe] = useState<Me>(null);

  const account = (accounts && accounts[0]) || null;
  const isSignedIn = !!account;

  const signIn = useCallback(async () => {
    await instance.loginPopup({ scopes: basicScopes });
    // post-login: pull identity/roles from API so we can see RBAC
    await (async () => {
      try {
        const t = await instance.acquireTokenSilent({ account: instance.getAllAccounts()[0], scopes: apiScopes });
        const r = await fetch("/api/secure/ping", { headers: { Authorization: `Bearer ${t.accessToken}` } });
        setMe(await r.json());
      } catch {
        setMe(null);
      }
    })();
  }, [instance]);

  const signOut = useCallback(async () => {
    setMe(null);
    await instance.logoutPopup();
  }, [instance]);

  const getAccessToken = useCallback(async () => {
    const acc = account || instance.getAllAccounts()[0];
    const res: AuthenticationResult = await instance.acquireTokenSilent({ account: acc, scopes: apiScopes });
    return res.accessToken;
  }, [account, instance]);

  const refreshMe = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const r = await fetch("/api/secure/ping", { headers: { Authorization: `Bearer ${token}` } });
      setMe(await r.json());
    } catch {
      setMe(null);
    }
  }, [getAccessToken]);

  const value = useMemo<AuthCtx>(() => ({
    account, isSignedIn, signIn, signOut, getAccessToken, me, refreshMe
  }), [account, isSignedIn, signIn, signOut, getAccessToken, me, refreshMe]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
