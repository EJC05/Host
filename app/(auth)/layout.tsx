import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <Link href="/" className="font-semibold tracking-tight">
        🏠 HouseKey
      </Link>
      {children}
    </div>
  );
}
