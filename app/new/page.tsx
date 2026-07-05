import Link from "next/link";
import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding/wizard";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Create your suite" };

export default async function NewSuitePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/new");
  }

  return (
    <div className="flex min-h-screen flex-col items-center gap-8 p-4 py-12">
      <Link href="/" className="font-semibold tracking-tight">
        🏠 HouseKey
      </Link>
      <OnboardingWizard userId={user.id} />
    </div>
  );
}
