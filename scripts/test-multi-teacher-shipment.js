// 整合測試：同一張訂單、多位老師分批到貨／分批完成／分批刪除的資料安全性驗證。
//
// 背景：葴葴預購的購物車／訂單本來就允許一張訂單同時包含多位老師的商品（cart 沒有限制
// 單一老師），而 shipment_items 是「每個 order_item 各自一筆」（見
// src/lib/actions/orders.ts 的 createPreorderShipmentItemsForGroups），到貨／合併／完成
// 出貨都是以「品項」為單位，不是整張訂單一起卡住。已完成出貨單的批量匯出/永久刪除
// （supabase/migrations/037_delete_completed_shipments_rpc.sql 的 delete_completed_shipments）
// 也是以「這批要刪除的 shipment_id 是否涵蓋這張訂單全部的 shipment_items」來決定要不要連原始
// 訂單一起刪除，而不是「整張訂單只要有出貨單完成就刪」。這支測試直接對 develop 使用的實際
// Supabase 資料庫呼叫這個真正的 RPC（純資料庫函式，不需要 Next.js 執行環境），驗證：
//   1. 老師A的出貨單完成/匯出後可以單獨被刪除，
//   2. 老師B尚未完成時，原始訂單、老師B的 order_items／數量單價快照／未到貨狀態／匯款資料
//      完全不受影響，
//   3. 老師B也完成後，整張訂單（含所有 order_items）才會進入可被刪除的狀態並被正確刪除。
//
// 執行方式：node scripts/test-multi-teacher-shipment.js
// 注意：這支測試會在目前 .env.local 指向的 Supabase 專案裡「實際新增又刪除」測試用的
// 老師／商品／訂單資料（名稱都加上 TEST_ 前綴，訂單編號為 LT_TEST_MULTI_ 開頭），
// 不會使用任何真實老師/商品/訂單。無論測試成功或失敗，finally 區塊都會清除所有測試資料。

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  const content = fs.readFileSync(envPath, "utf-8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const env = loadEnvLocal();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const results = [];
function assert(cond, msg) {
  results.push({ pass: !!cond, msg });
  if (!cond) {
    throw new Error(`斷言失敗：${msg}`);
  }
  console.log(`  [PASS] ${msg}`);
}

async function main() {
  const ids = { teacherIds: [], groupIds: [], orderIds: [], shipmentIds: [], exportBatchIds: [] };

  try {
    console.log("== 建立測試資料：老師A、老師B、同一張訂單各一個商品 ==");
    const suffix = Date.now().toString(36).toUpperCase().slice(-4);

    const { data: teacherA, error: teacherAErr } = await supabase
      .from("teachers")
      .insert({ teacher_code: `T${suffix}A`, name: `TEST_老師A_${suffix}`, is_active: true, is_artist_shop: false })
      .select("id")
      .single();
    if (teacherAErr) throw teacherAErr;
    ids.teacherIds.push(teacherA.id);

    const { data: teacherB, error: teacherBErr } = await supabase
      .from("teachers")
      .insert({ teacher_code: `T${suffix}B`, name: `TEST_老師B_${suffix}`, is_active: true, is_artist_shop: false })
      .select("id")
      .single();
    if (teacherBErr) throw teacherBErr;
    ids.teacherIds.push(teacherB.id);

    const { data: groupA } = await supabase
      .from("product_groups")
      .insert({ teacher_id: teacherA.id, name: "TEST商品A", price: 100, arrival_status: "not_arrived" })
      .select("id")
      .single();
    ids.groupIds.push(groupA.id);

    const { data: groupB } = await supabase
      .from("product_groups")
      .insert({ teacher_id: teacherB.id, name: "TEST商品B", price: 200, arrival_status: "not_arrived" })
      .select("id")
      .single();
    ids.groupIds.push(groupB.id);

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        order_number: `LT_TEST_MULTI_${suffix}`,
        order_type: "preorder",
        status: "pending",
        total_amount: 300,
        payment_status: "confirmed",
        pickup_method: "shipment",
        customer_name: "TEST買家",
      })
      .select("id")
      .single();
    if (orderErr) throw orderErr;
    ids.orderIds.push(order.id);

    const { data: itemA } = await supabase
      .from("order_items")
      .insert({
        order_id: order.id,
        product_name: "TEST商品A",
        teacher_name: `TEST_老師A_${suffix}`,
        teacher_code: `T${suffix}A`,
        product_group_id: groupA.id,
        product_group_name: "TEST商品A",
        quantity: 1,
        price: 100,
      })
      .select("id")
      .single();

    const { data: itemB } = await supabase
      .from("order_items")
      .insert({
        order_id: order.id,
        product_name: "TEST商品B",
        teacher_name: `TEST_老師B_${suffix}`,
        teacher_code: `T${suffix}B`,
        product_group_id: groupB.id,
        product_group_name: "TEST商品B",
        quantity: 1,
        price: 200,
      })
      .select("id")
      .single();

    // 比照 createPreorderShipmentItemsForGroups：每個 order_item 各自一筆 shipment_item。
    await supabase.from("shipment_items").insert([
      { order_item_id: itemA.id, order_id: order.id, order_type: "preorder", status: "not_arrived" },
      { order_item_id: itemB.id, order_id: order.id, order_type: "preorder", status: "not_arrived" },
    ]);

    await supabase.from("payments").insert({ order_id: order.id, actual_amount: 300 });

    console.log("\n== 步驟 1：老師A商品先到貨 ==");
    await supabase.from("shipment_items").update({ status: "arrived" }).eq("order_item_id", itemA.id).is("shipment_id", null);

    console.log("\n== 步驟 2：只將老師A的商品合併至出貨單A（老師B保持未到貨、未合併）==");
    const { data: shipmentA } = await supabase
      .from("shipments")
      .insert({ shipment_type: "preorder", status: "packing", customer_name: "TEST買家" })
      .select("id, shipment_number")
      .single();
    ids.shipmentIds.push(shipmentA.id);
    await supabase.from("shipment_items").update({ shipment_id: shipmentA.id }).eq("order_item_id", itemA.id);

    const { data: afterMergeA } = await supabase.from("shipment_items").select("*").eq("order_id", order.id);
    const itemBRowAfterMergeA = afterMergeA.find((i) => i.order_item_id === itemB.id);
    assert(itemBRowAfterMergeA.shipment_id === null, "老師B品項合併老師A出貨單後仍維持未合併");
    assert(itemBRowAfterMergeA.status === "not_arrived", "老師B品項合併老師A出貨單後仍維持未到貨");

    console.log("\n== 步驟 4：完成出貨單A ==");
    await supabase.from("shipment_items").update({ status: "completed" }).eq("shipment_id", shipmentA.id);
    await supabase
      .from("shipments")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        completed_by_role: "super_admin",
        completed_by_label: "TEST_super_admin",
      })
      .eq("id", shipmentA.id);

    console.log("\n== 步驟 5：匯出出貨單A（寫入 export_batch_id，符合刪除前置條件）==");
    const { data: batchA } = await supabase.from("export_batches").insert({ row_count: 1 }).select("id").single();
    ids.exportBatchIds.push(batchA.id);
    await supabase.from("shipments").update({ exported_at: new Date().toISOString(), export_batch_id: batchA.id }).eq("id", shipmentA.id);

    console.log("\n== 步驟 6：呼叫真正的 delete_completed_shipments RPC 刪除出貨單A ==");
    const { data: deleteResultA, error: deleteErrorA } = await supabase.rpc("delete_completed_shipments", {
      p_shipment_ids: [shipmentA.id],
    });
    assert(!deleteErrorA, `刪除出貨單A應成功：${deleteErrorA?.message ?? ""}`);
    assert(deleteResultA.deleted_shipment_count === 1, "應刪除 1 張出貨單（出貨單A）");
    assert(deleteResultA.deleted_order_count === 0, "原始訂單不應被刪除（老師B尚未完成）");

    console.log("\n== 步驟 7：驗證原始訂單與老師B資料完全不受影響 ==");
    const { data: orderAfter } = await supabase.from("orders").select("*").eq("id", order.id).maybeSingle();
    assert(orderAfter !== null, "原始訂單 LT_TEST_MULTI 仍存在");

    const { data: itemBAfter } = await supabase.from("order_items").select("*").eq("id", itemB.id).maybeSingle();
    assert(itemBAfter !== null, "老師B的 order_item 仍存在");
    assert(itemBAfter.quantity === 1 && Number(itemBAfter.price) === 200, "老師B商品數量與單價快照仍正確（1件/單價200）");

    const { data: shipmentItemBAfter } = await supabase
      .from("shipment_items")
      .select("*")
      .eq("order_item_id", itemB.id)
      .maybeSingle();
    assert(shipmentItemBAfter !== null, "老師B的 shipment_item 仍存在");
    assert(shipmentItemBAfter.status === "not_arrived" && shipmentItemBAfter.shipment_id === null, "老師B仍為未到貨、未合併狀態");

    const { data: paymentAfter } = await supabase.from("payments").select("*").eq("order_id", order.id).maybeSingle();
    assert(paymentAfter !== null && Number(paymentAfter.actual_amount) === 300, "訂單匯款資料仍存在且金額正確");

    const { data: shipmentItemAAfter } = await supabase
      .from("shipment_items")
      .select("*")
      .eq("order_item_id", itemA.id)
      .maybeSingle();
    assert(shipmentItemAAfter === null, "老師A的 shipment_item 已隨出貨單A一併刪除");

    const { data: shipmentAAfter } = await supabase.from("shipments").select("*").eq("id", shipmentA.id).maybeSingle();
    assert(shipmentAAfter === null, "出貨單A本身已被刪除");

    console.log("\n== 步驟 8：確認此時整張訂單仍不可被判定為「可刪除」==");
    const { data: allItemsForOrder } = await supabase.from("shipment_items").select("status").eq("order_id", order.id);
    assert(
      !allItemsForOrder.every((i) => i.status === "completed"),
      "老師B尚未完成前，訂單內品項並非全部 completed，deletePreorderOrder 的整張刪除條件不成立"
    );

    console.log("\n== 步驟 9：老師B到貨、合併、完成、匯出 ==");
    await supabase.from("shipment_items").update({ status: "arrived" }).eq("order_item_id", itemB.id).is("shipment_id", null);
    const { data: shipmentB } = await supabase
      .from("shipments")
      .insert({ shipment_type: "preorder", status: "packing", customer_name: "TEST買家" })
      .select("id")
      .single();
    ids.shipmentIds.push(shipmentB.id);
    await supabase.from("shipment_items").update({ shipment_id: shipmentB.id }).eq("order_item_id", itemB.id);
    await supabase.from("shipment_items").update({ status: "completed" }).eq("shipment_id", shipmentB.id);
    await supabase
      .from("shipments")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        completed_by_role: "super_admin",
        completed_by_label: "TEST_super_admin",
      })
      .eq("id", shipmentB.id);
    const { data: batchB } = await supabase.from("export_batches").insert({ row_count: 1 }).select("id").single();
    ids.exportBatchIds.push(batchB.id);
    await supabase.from("shipments").update({ exported_at: new Date().toISOString(), export_batch_id: batchB.id }).eq("id", shipmentB.id);

    console.log("\n== 步驟 9（續）：刪除出貨單B，這次應該連整張原始訂單一起被刪除 ==");
    const { data: deleteResultB, error: deleteErrorB } = await supabase.rpc("delete_completed_shipments", {
      p_shipment_ids: [shipmentB.id],
    });
    assert(!deleteErrorB, `刪除出貨單B應成功：${deleteErrorB?.message ?? ""}`);
    assert(deleteResultB.deleted_order_count === 1, "老師B也完成後，整張原始訂單應該被判定可刪除並刪除");

    const { data: orderFinal } = await supabase.from("orders").select("*").eq("id", order.id).maybeSingle();
    assert(orderFinal === null, "整張原始訂單最終已被刪除");
    const { data: itemAFinal } = await supabase.from("order_items").select("*").eq("id", itemA.id).maybeSingle();
    assert(itemAFinal === null, "訂單刪除後，老師A的 order_item 已 cascade 刪除");
    const { data: itemBFinal } = await supabase.from("order_items").select("*").eq("id", itemB.id).maybeSingle();
    assert(itemBFinal === null, "訂單刪除後，老師B的 order_item 已 cascade 刪除");

    // shipmentB/exportBatch 已隨 RPC 刪除，從清理清單移除避免重複刪除噪音（無害，但保持乾淨）
    ids.shipmentIds = ids.shipmentIds.filter((id) => id !== shipmentA.id && id !== shipmentB.id);

    console.log("\n=== 全部斷言通過 ===");
  } catch (err) {
    console.error("\n=== 測試失敗 ===");
    console.error(err);
    process.exitCode = 1;
  } finally {
    console.log("\n== 清除測試資料 ==");
    if (ids.exportBatchIds.length) await supabase.from("export_batches").delete().in("id", ids.exportBatchIds);
    if (ids.shipmentIds.length) await supabase.from("shipments").delete().in("id", ids.shipmentIds);
    if (ids.orderIds.length) await supabase.from("orders").delete().in("id", ids.orderIds); // cascade 清 order_items/payments/shipment_items
    if (ids.groupIds.length) await supabase.from("product_groups").delete().in("id", ids.groupIds);
    if (ids.teacherIds.length) await supabase.from("teachers").delete().in("id", ids.teacherIds);
    console.log("測試資料已清除。");

    console.log("\n== 測試結果摘要 ==");
    for (const r of results) {
      console.log(`${r.pass ? "PASS" : "FAIL"} - ${r.msg}`);
    }
  }
}

main();
