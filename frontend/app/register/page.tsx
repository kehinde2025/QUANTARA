import AuthForm from "@/components/AuthForm";

export default function RegisterPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-semibold text-gold">Quantara</h1>
      <p className="mb-8 mt-1 text-sm text-muted">Create your account.</p>
      <AuthForm mode="register" />
    </main>
  );
}