"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export interface ActionResult {
  success: boolean;
  message: string;
}

export interface PaymentSettingsInput {
  bankName: string;
  bankCode: string;
  accountName: string;
  accountNumber: string;
  remittanceNote: string;
  isActive: boolean;
}

function validate(input: PaymentSettingsInput): string | null {
  if (!input.bankName.trim()) return "請輸入銀行名稱";
  if (!input.accountName.trim()) return "請輸入戶名";
  if (!input.accountNumber.trim()) return "請輸入帳號";
  return null;
}

// 目前只支援一組啟用帳戶：設成啟用時，先把其他帳戶都設回未啟用。
async function deactivateOthers(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  keepId?: string
) {
  let query = supabase.from("payment_settings").update({ is_active: false });
  if (keepId) query = query.neq("id", keepId);
  await query.eq("is_active", true);
}

export async function createPaymentSettings(input: PaymentSettingsInput): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const validationError = validate(input);
  if (validationError) return { success: false, message: validationError };

  if (input.isActive) {
    await deactivateOthers(supabase);
  }

  const { error } = await supabase.from("payment_settings").insert({
    bank_name: input.bankName.trim(),
    bank_code: input.bankCode.trim() || null,
    account_name: input.accountName.trim(),
    account_number: input.accountNumber.trim(),
    remittance_note: input.remittanceNote.trim() || null,
    is_active: input.isActive,
  });

  if (error) return { success: false, message: error.message };

  revalidatePath("/admin/payment-settings");
  return { success: true, message: "已新增匯款帳戶" };
}

export async function updatePaymentSettings(
  id: string,
  input: PaymentSettingsInput
): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const validationError = validate(input);
  if (validationError) return { success: false, message: validationError };

  if (input.isActive) {
    await deactivateOthers(supabase, id);
  }

  const { error } = await supabase
    .from("payment_settings")
    .update({
      bank_name: input.bankName.trim(),
      bank_code: input.bankCode.trim() || null,
      account_name: input.accountName.trim(),
      account_number: input.accountNumber.trim(),
      remittance_note: input.remittanceNote.trim() || null,
      is_active: input.isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { success: false, message: error.message };

  revalidatePath("/admin/payment-settings");
  return { success: true, message: "已更新匯款帳戶" };
}

export async function setActivePaymentSettings(id: string): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  await deactivateOthers(supabase, id);

  const { error } = await supabase
    .from("payment_settings")
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { success: false, message: error.message };

  revalidatePath("/admin/payment-settings");
  return { success: true, message: "已設為啟用帳戶" };
}
