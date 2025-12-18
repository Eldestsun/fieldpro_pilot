import { OpsButton } from "../components/ui/OpsButton";
import logo from "../assets/invaria-baseline.svg";

type Props = {
  onSignIn: () => void;
  isLoading?: boolean;
};

export function LoginPage({ onSignIn, isLoading }: Props) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        background: "#f8fafc",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
          padding: "2rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.25rem" }}>
          <img
            src={logo}
            alt="Invaria Baseline"
            style={{ maxWidth: "100%", height: "auto" }}
          />
        </div>

        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <div style={{ marginTop: 6, fontSize: 14, color: "#64748b" }}>
            Sign in with your organization account to continue.
          </div>
        </div>

        <OpsButton
          variant="primary"
          size="lg"
          onClick={onSignIn}
          disabled={!!isLoading}
          style={{ width: "100%" }}
        >
          {isLoading ? "Signing in..." : "Sign in"}
        </OpsButton>

        <div style={{ marginTop: "1.25rem", fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
          v0.9.6
        </div>
      </div>
    </div>
  );
}