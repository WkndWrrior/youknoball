import { LoginForm } from "@/components/LoginForm";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return <LoginForm callbackError={params.error ?? null} />;
}
