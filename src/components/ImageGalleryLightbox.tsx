"use client";

import { useState } from "react";

// 商品品項圖片放大鏡：縮圖用第一張圖，點開後可以左右切換所有圖片。
export function ImageGalleryLightbox({
  images,
  alt,
  thumbnailClassName,
}: {
  images: string[];
  alt: string;
  thumbnailClassName: string;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (images.length === 0) return null;

  function show(delta: number) {
    setOpenIndex((current) => {
      if (current === null) return current;
      return (current + delta + images.length) % images.length;
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpenIndex(0)} className="block shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={images[0]}
          alt={alt}
          className={`${thumbnailClassName} cursor-zoom-in transition hover:opacity-90`}
        />
      </button>

      {openIndex !== null && (
        <div
          onClick={() => setOpenIndex(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          <button
            type="button"
            onClick={() => setOpenIndex(null)}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-lg text-zinc-700"
            aria-label="關閉"
          >
            ×
          </button>

          {images.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                show(-1);
              }}
              className="absolute left-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-xl text-zinc-700"
              aria-label="上一張"
            >
              ‹
            </button>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[openIndex]}
            alt={`${alt} ${openIndex + 1}`}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-lg object-contain"
          />

          {images.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                show(1);
              }}
              className="absolute right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-xl text-zinc-700"
              aria-label="下一張"
            >
              ›
            </button>
          )}

          {images.length > 1 && (
            <p className="absolute bottom-6 rounded-full bg-white/90 px-3 py-1 text-xs text-zinc-600">
              {openIndex + 1} / {images.length}
            </p>
          )}
        </div>
      )}
    </>
  );
}
