// src/auth/RequireRole.tsx
import { useAuth } from "./AuthContext";

export default function RequireRole(
  { anyOf, children }: { anyOf: string[]; children: React.ReactNode }
) {
  const { me } = useAuth();
  const roles = me?.roles ?? [];
  const allowed = roles.some(r => anyOf.includes(r) || r === "Admin");
  if (!allowed) return null;
  return <>{children}</>;
}
