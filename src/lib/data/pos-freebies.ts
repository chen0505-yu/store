import { getPosSupabaseServerClient as getSupabaseServerClient } from "@/lib/supabase/pos-server";
import type { PosFreebieOption, PosFreebieRule, PosFreebieRuleType } from "@/lib/pos-types";

interface PosFreebieOptionRow {
  id: string;
  rule_id: string;
  name: string;
  stock_quantity: number;
  sort_order: number;
}

interface PosFreebieRuleRow {
  id: string;
  artist_id: string;
  name: string;
  rule_type: PosFreebieRuleType;
  threshold_amount: number | null;
  trigger_group_id: string | null;
  is_stackable: boolean;
  is_active: boolean;
  sort_order: number;
  pos_freebie_options: PosFreebieOptionRow[];
}

const RULE_SELECT =
  "id, artist_id, name, rule_type, threshold_amount, trigger_group_id, is_stackable, is_active, sort_order, " +
  "pos_freebie_options(id, rule_id, name, stock_quantity, sort_order)";

function mapOption(row: PosFreebieOptionRow): PosFreebieOption {
  return {
    id: row.id,
    ruleId: row.rule_id,
    name: row.name,
    stockQuantity: row.stock_quantity,
    sortOrder: row.sort_order,
  };
}

function mapRule(row: PosFreebieRuleRow): PosFreebieRule {
  return {
    id: row.id,
    artistId: row.artist_id,
    name: row.name,
    ruleType: row.rule_type,
    thresholdAmount: row.threshold_amount !== null ? Number(row.threshold_amount) : null,
    triggerGroupId: row.trigger_group_id,
    isStackable: row.is_stackable,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    options: (row.pos_freebie_options ?? []).map(mapOption).sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

// 給 POS 收銀畫面用：只回傳這位繪師「啟用中」的規則。
export async function getActiveFreebieRulesByArtist(artistId: string): Promise<PosFreebieRule[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("pos_freebie_rules")
    .select(RULE_SELECT)
    .eq("artist_id", artistId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[LITAN POS] 讀取贈品規則失敗", error.message);
    return [];
  }
  return ((data ?? []) as unknown as PosFreebieRuleRow[]).map(mapRule);
}

export async function getFreebieRulesByArtist(artistId: string): Promise<PosFreebieRule[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("pos_freebie_rules")
    .select(RULE_SELECT)
    .eq("artist_id", artistId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[LITAN POS] 讀取贈品規則失敗", error.message);
    return [];
  }
  return ((data ?? []) as unknown as PosFreebieRuleRow[]).map(mapRule);
}

export interface PosFreebieRuleWithArtistName extends PosFreebieRule {
  artistName: string;
}

// 給後台管理列表用：跨繪師列出所有贈品規則，附上繪師名稱。
export async function getAllFreebieRulesWithArtistName(): Promise<PosFreebieRuleWithArtistName[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("pos_freebie_rules")
    .select(`${RULE_SELECT}, pos_artists(name)`)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[LITAN POS] 讀取贈品規則清單失敗", error.message);
    return [];
  }

  return ((data ?? []) as unknown as (PosFreebieRuleRow & { pos_artists: { name: string } | null })[]).map((row) => ({
    ...mapRule(row),
    artistName: row.pos_artists?.name ?? "-",
  }));
}
