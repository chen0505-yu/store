"use client";

import { useState, useTransition } from "react";
import type { ArtistZoneAd } from "@/lib/data/artist-zone-ads";
import {
  createArtistZoneAd,
  deleteArtistZoneAd,
  toggleArtistZoneAdVisible,
  updateArtistZoneAd,
} from "@/lib/actions/artist-zone-ads";
import { MultiImageUploader } from "./MultiImageUploader";

function AdForm({
  initial,
  onSubmit,
  submitLabel,
  isPending,
}: {
  initial?: { imageUrl: string; title: string; description: string; linkUrl: string };
  onSubmit: (input: { imageUrl: string; title: string; description: string; linkUrl: string }) => void;
  submitLabel: string;
  isPending: boolean;
}) {
  const [imageUrls, setImageUrls] = useState<string[]>(initial?.imageUrl ? [initial.imageUrl] : []);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [linkUrl, setLinkUrl] = useState(initial?.linkUrl ?? "");

  return (
    <div className="flex flex-col gap-2">
      <MultiImageUploader value={imageUrls} onChange={(urls) => setImageUrls(urls.slice(-1))} folder="artist-zone-ads" />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="標題（選填）"
        className="rounded-lg border border-purple-200 px-3 py-2 text-sm"
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="說明（選填）"
        className="rounded-lg border border-purple-200 px-3 py-2 text-sm"
      />
      <input
        value={linkUrl}
        onChange={(e) => setLinkUrl(e.target.value)}
        placeholder="點擊連結（選填）"
        className="rounded-lg border border-purple-200 px-3 py-2 text-sm"
      />
      <button
        onClick={() => onSubmit({ imageUrl: imageUrls[0] ?? "", title, description, linkUrl })}
        disabled={isPending || !imageUrls[0]}
        className="w-fit rounded-full bg-purple-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
      >
        {isPending ? "儲存中..." : submitLabel}
      </button>
    </div>
  );
}

function AdRow({ ad }: { ad: ArtistZoneAd }) {
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (editing) {
    return (
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <AdForm
          initial={{ imageUrl: ad.imageUrl, title: ad.title ?? "", description: ad.description ?? "", linkUrl: ad.linkUrl ?? "" }}
          submitLabel="儲存"
          isPending={isPending}
          onSubmit={(input) =>
            startTransition(async () => {
              const result = await updateArtistZoneAd(ad.id, input);
              setMessage(result.message);
              if (result.success) setEditing(false);
            })
          }
        />
        <button onClick={() => setEditing(false)} className="mt-2 text-xs text-zinc-400 underline">
          取消
        </button>
        {message && <p className="mt-1 text-xs text-purple-600">{message}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ad.imageUrl} alt={ad.title ?? "廣告"} className="h-16 w-24 rounded-xl object-cover" />
        <div>
          <p className="font-semibold text-zinc-800">{ad.title || "（無標題）"}</p>
          {ad.description && <p className="text-xs text-zinc-500">{ad.description}</p>}
          {ad.linkUrl && <p className="text-xs text-purple-400">{ad.linkUrl}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => setEditing(true)} className="rounded-full bg-purple-50 px-3 py-1 text-xs text-purple-600">
          編輯
        </button>
        <button
          onClick={() =>
            startTransition(async () => {
              await toggleArtistZoneAdVisible(ad.id, !ad.isVisible);
            })
          }
          disabled={isPending}
          className={`rounded-full px-3 py-1 text-xs ${ad.isVisible ? "bg-purple-500 text-white" : "bg-zinc-100 text-zinc-400"}`}
        >
          {ad.isVisible ? "顯示中" : "已隱藏"}
        </button>
        <button
          onClick={() => {
            if (!window.confirm("確定要刪除此廣告嗎？")) return;
            startTransition(async () => {
              await deleteArtistZoneAd(ad.id);
            });
          }}
          disabled={isPending}
          className="rounded-full bg-red-50 px-3 py-1 text-xs text-red-500"
        >
          刪除
        </button>
      </div>
    </div>
  );
}

export function ArtistZoneAdList({ ads }: { ads: ArtistZoneAd[] }) {
  const [showCreate, setShowCreate] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <button onClick={() => setShowCreate((v) => !v)} className="text-sm font-semibold text-purple-600">
          {showCreate ? "− 取消新增" : "＋ 新增廣告"}
        </button>
        {showCreate && (
          <div className="mt-3">
            <AdForm
              submitLabel="新增廣告"
              isPending={isPending}
              onSubmit={(input) =>
                startTransition(async () => {
                  const result = await createArtistZoneAd(input);
                  setMessage(result.message);
                  if (result.success) setShowCreate(false);
                })
              }
            />
          </div>
        )}
        {message && <p className="mt-2 text-xs text-purple-600">{message}</p>}
      </div>

      {ads.length === 0 ? (
        <p className="text-sm text-zinc-400">尚無廣告</p>
      ) : (
        <div className="flex flex-col gap-3">
          {ads.map((ad) => (
            <AdRow key={ad.id} ad={ad} />
          ))}
        </div>
      )}
    </div>
  );
}
