import { getSupabaseServerClient } from "@/lib/supabase/server";

export interface PaymentSettingsView {
  id: string;
  bankName: string;
  bankCode: string | null;
  accountName: string;
  accountNumber: string;
  remittanceNote: string | null;
  isActive: boolean;
}

interface PaymentSettingsRow {
  id: string;
  bank_name: string;
  bank_code: string | null;
  account_name: string;
  account_number: string;
  remittance_note: string | null;
  is_active: boolean;
}

function mapRow(row: PaymentSettingsRow): PaymentSettingsView {
  return {
    id: row.id,
    bankName: row.bank_name,
    bankCode: row.bank_code,
    accountName: row.account_name,
    accountNumber: row.account_number,
    remittanceNote: row.remittance_note,
    isActive: row.is_active,
  };
}

// 客戶下單完成頁、會員中心未付款/待確認訂單要顯示的匯款帳戶：目前只支援一組啟用帳戶。
export async function getActivePaymentSettings(): Promise<PaymentSettingsView | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("payment_settings")
    .select("id, bank_name, bank_code, account_name, account_number, remittance_note, is_active")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? mapRow(data) : null;
}

// 後台匯款帳戶管理頁：列出全部帳戶（含未啟用的），方便之後切換。
export async function getAllPaymentSettings(): Promise<PaymentSettingsView[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("payment_settings")
    .select("id, bank_name, bank_code, account_name, account_number, remittance_note, is_active")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[LITAN] 讀取匯款帳戶失敗", error.message);
    return [];
  }

  return (data ?? []).map(mapRow);
}
