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
        background: "var(--surface-app)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          background: "var(--surface-card)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-modal)",
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
          <div style={{ marginTop: 6, fontSize: 14, color: "var(--text-muted)" }}>
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

        <div style={{ marginTop: "1.25rem", fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)", textAlign: "center" }}>
          v0.9.6
        </div>
      </div>
    </div>
  );
}