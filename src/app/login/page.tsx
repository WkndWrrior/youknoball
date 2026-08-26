import { LoginForm } from "@/components/LoginForm";
import { normalizeAuthRedirectPath } from "@/lib/authFlow";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    next?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <LoginForm
      callbackError={params.error ?? null}
      redirectPath={normalizeAuthRedirectPath(params.next)}
    />
  );
}
