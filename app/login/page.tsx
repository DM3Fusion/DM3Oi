import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { sendLoginOtpAction, verifyLoginOtpAction } from "@/lib/auth/actions";
import { isSupabaseConfigured } from "@/lib/supabase/server";

type Params = {
  error?: string;
  message?: string;
  next?: string;
  sent?: string;
  email?: string;
};

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<Params>;
}) {
  const params = await searchParams;
  const sent = params?.sent === "1";
  const email = params?.email ?? "";
  const next = params?.next ?? "";
  const error = !isSupabaseConfigured()
    ? "Supabase environment variables are not configured."
    : params?.error;

  return (
    <AuthCard
      title="Sign in"
      description="Sign in using a verification code sent to your email."
      error={error}
    >
      {params?.message ? (
        <div className="auth-message">{params.message}</div>
      ) : null}
      {sent ? (
        <form action={verifyLoginOtpAction} className="auth-form">
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="next" value={next} />
          <div className="auth-message">
            We sent a login code to <b>{email}</b>.
          </div>
          <label>
            <span>Email Code</span>
            <input
              className="code-input"
              name="token"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              autoFocus
              placeholder="000000"
            />
          </label>
          <PendingSubmitButton pendingLabel="Verifying…">
            Verify &amp; Sign In
          </PendingSubmitButton>
          <Link
            className="auth-link"
            href={`/login?email=${encodeURIComponent(email)}${next ? `&next=${encodeURIComponent(next)}` : ""}`}
          >
            Send another code
          </Link>
        </form>
      ) : (
        <form action={sendLoginOtpAction} className="auth-form">
          <input type="hidden" name="next" value={next} />
          <label>
            <span>Enter your Email Address</span>
            <input
              name="email"
              type="email"
              required
              defaultValue={email}
              autoComplete="email"
            />
          </label>
          <PendingSubmitButton pendingLabel="Sending…">
            Send Code
          </PendingSubmitButton>
        </form>
      )}
    </AuthCard>
  );
}
