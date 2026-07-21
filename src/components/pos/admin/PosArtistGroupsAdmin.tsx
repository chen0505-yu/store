"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PosEvent } from "@/lib/pos-types";
import type { PosArtistWithEventName } from "@/lib/data/pos-artists";
import type { PosArtistGroupWithEventName } from "@/lib/data/pos-artist-groups";
import { createPosArtistGroup, updatePosArtistGroup, deletePosArtistGroup } from "@/lib/actions/pos-artist-groups";
import { GlassCard } from "@/components/pos/GlassCard";
import { GlowButton } from "@/components/pos/GlowButton";

// 「已被別的群組佔用」的成員清單，key 是 artistId，value 是佔用的群組名稱。
// 編輯某個群組時要排除它自己（自己的成員不算佔用）。
function buildTakenMap(groups: PosArtistGroupWithEventName[], excludeGroupId: string | null) {
  const taken = new Map<string, string>();
  for (const group of groups) {
    if (group.id === excludeGroupId) continue;
    for (const memberId of group.memberArtistIds) taken.set(memberId, group.name);
  }
  return taken;
}

function ArtistCheckboxList({
  artists,
  selected,
  takenMap,
  onToggle,
}: {
  artists: PosArtistWithEventName[];
  selected: Set<string>;
  takenMap: Map<string, string>;
  onToggle: (artistId: string) => void;
}) {
  if (artists.length === 0) {
    return <p className="text-xs text-[var(--pos-text-muted)]">這個活動目前沒有繪師</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {artists.map((artist) => {
        const takenBy = takenMap.get(artist.id);
        const disabled = Boolean(takenBy) && !selected.has(artist.id);
        return (
          <label
            key={artist.id}
            className={`pos-input flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs ${
              disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"
            }`}
          >
            <input
              type="checkbox"
              checked={selected.has(artist.id)}
              disabled={disabled}
              onChange={() => onToggle(artist.id)}
            />
            {artist.name}
            {takenBy && <span className="text-[var(--pos-text-muted)]">（已在「{takenBy}」）</span>}
          </label>
        );
      })}
    </div>
  );
}

function CreateGroupForm({
  events,
  artists,
  groups,
}: {
  events: PosEvent[];
  artists: PosArtistWithEventName[];
  groups: PosArtistGroupWithEventName[];
}) {
  const router = useRouter();
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const artistsInEvent = useMemo(() => artists.filter((a) => a.eventId === eventId && a.isActive), [artists, eventId]);
  const takenMap = useMemo(() => buildTakenMap(groups, null), [groups]);

  function toggle(artistId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(artistId)) next.delete(artistId);
      else next.add(artistId);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createPosArtistGroup({ eventId, name, memberArtistIds: [...selected] });
      setMessage(result.message);
      if (result.success) {
        setName("");
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  if (events.length === 0) {
    return <p className="text-sm text-[var(--pos-text-muted)]">請先到「活動管理」建立活動，才能新增共用攤位。</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--pos-text-muted)]">所屬活動</label>
          <select
            className="pos-input px-3 py-2 text-sm"
            value={eventId}
            onChange={(e) => {
              setEventId(e.target.value);
              setSelected(new Set());
            }}
          >
            {events.map((event) => (
              <option key={event.id} value={event.id} className="bg-[#1a1140]">
                {event.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--pos-text-muted)]">共用攤位名稱</label>
          <input
            className="pos-input px-3 py-2 text-sm"
            placeholder="例如：主攤"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <GlowButton type="submit" disabled={isPending}>
          新增共用攤位
        </GlowButton>
      </div>
      <div>
        <p className="mb-1.5 text-xs text-[var(--pos-text-muted)]">群組成員</p>
        <ArtistCheckboxList artists={artistsInEvent} selected={selected} takenMap={takenMap} onToggle={toggle} />
      </div>
      {message && <p className="text-sm text-[var(--pos-gold)]">{message}</p>}
    </form>
  );
}

function GroupRow({
  group,
  artists,
  groups,
  canDelete,
}: {
  group: PosArtistGroupWithEventName;
  artists: PosArtistWithEventName[];
  groups: PosArtistGroupWithEventName[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [selected, setSelected] = useState<Set<string>>(new Set(group.memberArtistIds));
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const artistsInEvent = useMemo(
    () => artists.filter((a) => a.eventId === group.eventId && a.isActive),
    [artists, group.eventId]
  );
  const takenMap = useMemo(() => buildTakenMap(groups, group.id), [groups, group.id]);

  function toggle(artistId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(artistId)) next.delete(artistId);
      else next.add(artistId);
      return next;
    });
  }

  function save() {
    startTransition(async () => {
      const result = await updatePosArtistGroup(group.id, {
        eventId: group.eventId,
        name,
        memberArtistIds: [...selected],
      });
      setMessage(result.message);
      if (result.success) {
        setIsEditing(false);
        router.refresh();
      }
    });
  }

  function remove() {
    if (!confirm(`確定要刪除共用攤位「${group.name}」嗎？（不會影響已成立的歷史訂單）`)) return;
    startTransition(async () => {
      const result = await deletePosArtistGroup(group.id);
      setMessage(result.message);
      router.refresh();
    });
  }

  return (
    <GlassCard className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        {isEditing ? (
          <input className="pos-input px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
        ) : (
          <div>
            <p className="font-semibold">{group.name}</p>
            <p className="text-xs text-[var(--pos-text-muted)]">{group.eventName}</p>
          </div>
        )}
        <div className="flex shrink-0 items-center gap-2 text-sm">
          {isEditing ? (
            <>
              <button onClick={save} disabled={isPending} className="pos-glow-btn px-3 py-1.5 text-xs">
                儲存
              </button>
              <button onClick={() => setIsEditing(false)} className="pos-input px-3 py-1.5 text-xs">
                取消
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setIsEditing(true)} className="pos-input px-3 py-1.5 text-xs">
                編輯
              </button>
              {canDelete && (
                <button onClick={remove} className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300">
                  刪除
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {isEditing ? (
        <ArtistCheckboxList artists={artistsInEvent} selected={selected} takenMap={takenMap} onToggle={toggle} />
      ) : (
        <p className="text-sm text-[var(--pos-text-muted)]">
          成員：{group.members.length > 0 ? group.members.map((m) => m.name).join("、") : "尚未加入任何 Artist"}
        </p>
      )}
      {message && <p className="text-xs text-[var(--pos-gold)]">{message}</p>}
    </GlassCard>
  );
}

export function PosArtistGroupsAdmin({
  events,
  artists,
  groups,
  canDelete,
}: {
  events: PosEvent[];
  artists: PosArtistWithEventName[];
  groups: PosArtistGroupWithEventName[];
  canDelete: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--pos-gold)" }}>
          共用攤位設定
        </h1>
        <p className="text-sm text-[var(--pos-text-muted)]">
          多位 Artist 共用同一台收銀機、同一次結帳。不會改變 Artist 本身的獨立頁面，兩邊可以並存使用。
        </p>
      </div>

      <GlassCard>
        <CreateGroupForm events={events} artists={artists} groups={groups} />
      </GlassCard>

      <div className="flex flex-col gap-3">
        {groups.map((group) => (
          <GroupRow key={group.id} group={group} artists={artists} groups={groups} canDelete={canDelete} />
        ))}
        {groups.length === 0 && <p className="text-sm text-[var(--pos-text-muted)]">尚未建立任何共用攤位</p>}
      </div>
    </div>
  );
}
