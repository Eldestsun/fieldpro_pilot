import { createContext, useContext, useMemo, useState, useCallback, useEffect } from "react";
import { useMsal } from "@azure/msal-react";
import type { AccountInfo, AuthenticationResult } from "@azure/msal-browser";
import { clearOfflineStateForUser } from "../offline/offlineQueue";

type Me = { ok: boolean; roles?: string[]; user?: any } | null;

type AuthCtx = {
  account: AccountInfo | null;
  isSignedIn: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string>;
  me: Me;
  refreshMe: () => Promise<void>;
  isLoading: boolean;
};

const AuthContext = createContext<AuthCtx | undefined>(undefined);

const basicScopes = ["openid", "profile", "email"];
const apiAppIdUri = import.meta.env.VITE_API_APP_ID_URI; // e.g. api://<API_CLIENT_ID>
const apiScopes = [`${apiAppIdUri}/access_as_user`];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { instance, accounts } = useMsal();
  const [me, setMe] = useState<Me>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const account = (accounts && accounts[0]) || null;
  const isSignedIn = !!account;

  const getAccessToken = useCallback(async () => {
    const acc =
      instance.getActiveAccount() ||
      account ||
      instance.getAllAccounts()[0];

    if (!acc) throw new Error("No signed-in account found for token acquisition.");

    const res: AuthenticationResult = await instance.acquireTokenSilent({
      account: acc,
      scopes: apiScopes,
    });

    return res.accessToken;
  }, [account, instance]);

  const fetchMe = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const r = await fetch("/api/secure/ping", { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) {
        setMe(await r.json());
      } else {
        setMe(null);
      }
    } catch {
      setMe(null);
    }
  }, [getAccessToken]);

  // Auto-fetch identity when signed in but me is missing
  useEffect(() => {
    if (isSignedIn && !me && !isLoading) {
      setIsLoading(true);
      fetchMe().finally(() => setIsLoading(false));
    }
  }, [isSignedIn, me, isLoading, fetchMe]);

  const signIn = useCallback(async () => {
    const result = await instance.loginPopup({ scopes: [...basicScopes, ...apiScopes] });

    if (result.account) {
      instance.setActiveAccount(result.account);
    }

    setIsLoading(true);
    await fetchMe();
    setIsLoading(false);
  }, [instance, fetchMe]);

  const signOut = useCallback(async () => {
    // 1. Determine tenantId and oid from ephemeral account state before clearing references
    const tenantId = account?.tenantId;
    const claims = account?.idTokenClaims as any;
    const oid = claims?.oid || account?.localAccountId;

    // 2. Clear per-user offline state
    clearOfflineStateForUser(tenantId, oid);

    setMe(null);
    await instance.logoutPopup();
  }, [instance, account]);

  const refreshMe = useCallback(async () => {
    setIsLoading(true);
    await fetchMe();
    setIsLoading(false);
  }, [fetchMe]);

  const value = useMemo<AuthCtx>(() => ({
    account, isSignedIn, signIn, signOut, getAccessToken, me, refreshMe, isLoading,
  }), [account, isSignedIn, signIn, signOut, getAccessToken, me, refreshMe, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
