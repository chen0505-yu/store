import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/pos-auth";
import { PosLoginForm } from "@/components/pos/PosLoginForm";

export default async function PosLoginPage() {
  const staff = await getCurrentStaff();
  if (staff) redirect("/pos");

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <PosLoginForm />
    </div>
  );
}
