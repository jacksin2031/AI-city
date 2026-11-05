"use client";

import { createDevelopmentCity, prepareSpineBundle } from "@ai-city/city";
import { developmentResidents } from "@ai-city/contracts/fixtures";
import { useEffect, useRef, useState } from "react";

/** An intentionally fictional one-part rig for integration tests, not a production avatar. */
async function syntheticBundle() {
  const encode = (text: string) => new TextEncoder().encode(text);
  const hash = async (data: Uint8Array) =>
    [...new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(data)))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  const texture = document.createElement("canvas");
  texture.width = 16;
  texture.height = 16;
  const ctx = texture.getContext("2d");
  if (!ctx) throw new Error("CANVAS_UNAVAILABLE");
  ctx.fillStyle = "#dd5b31";
  ctx.fillRect(0, 0, 16, 16);
  const png = await new Promise<Blob>((resolve, reject) =>
    texture.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("PNG_UNAVAILABLE"))),
      "image/png",
    ),
  );
  const animations = Object.fromEntries(
    ["front", "back", "left", "right"].flatMap((direction) =>
      ["idle", "trot"].map((action) => [
        `movement/${action}-${direction}`,
        {
          bones: {
            root: { rotate: [{ value: -12 }, { time: 0.5, value: 12 }, { time: 1, value: -12 }] },
          },
        },
      ]),
    ),
  );
  const skeleton = {
    skeleton: { spine: "4.3.00" },
    bones: [{ name: "root" }],
    slots: [{ name: "body", bone: "root", attachment: "body" }],
    skins: [{ name: "synthetic", attachments: { body: { body: { width: 40, height: 80 } } } }],
    animations,
  };
  const assets = {
    "skeleton.json": encode(JSON.stringify(skeleton)),
    "skeleton.atlas": encode(
      "page.png\nsize: 16,16\nfilter: Nearest,Nearest\nbody\n  bounds: 0,0,16,16\n",
    ),
    "orientation-policy.json": encode(
      JSON.stringify({ skin: "synthetic", face_slots: [], front_order: [] }),
    ),
    "page.png": new Uint8Array(await png.arrayBuffer()),
  };
  const files = Object.fromEntries(
    await Promise.all(Object.entries(assets).map(async ([name, data]) => [name, await hash(data)])),
  );
  const manifest = encode(
    JSON.stringify({
      skin: "synthetic",
      runtime: { package: "@esotericsoftware/spine-canvas", version: "4.3.13" },
      runtime_guard_required: true,
      files,
    }),
  );
  const base = "/avatars/synthetic/v1/";
  return prepareSpineBundle(
    {
      runtime: "4.3",
      skeleton: `${base}skeleton.json`,
      atlas: `${base}skeleton.atlas`,
      pages: [`${base}page.png`],
      orientationPolicy: `${base}orientation-policy.json`,
      buildManifest: `${base}build-manifest.json`,
      sha256: await hash(manifest),
    },
    manifest,
    assets,
  );
}

export default function SpineTest() {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("読み込み中");
  useEffect(() => {
    if (!host.current) return;
    const parent = host.current,
      abort = new AbortController();
    let city: Awaited<ReturnType<typeof createDevelopmentCity>> | undefined;
    let bundle: Awaited<ReturnType<typeof prepareSpineBundle>> | undefined;
    void (async () => {
      try {
        bundle = await syntheticBundle();
        if (abort.signal.aborted) {
          bundle.dispose();
          return;
        }
        const created = await createDevelopmentCity(parent, {
          residents: developmentResidents.slice(0, 1),
          fillViewport: true,
          signal: abort.signal,
          createAnimatedCharacter: () => bundle?.create() ?? null,
        });
        if (abort.signal.aborted) {
          created.destroy();
          bundle.dispose();
          return;
        }
        city = created;
        const resident = developmentResidents[0];
        if (resident) city.present({ kind: "profile", id: resident.residentId });
        setStatus("Spine 表示中");
      } catch {
        if (!abort.signal.aborted) setStatus("Spine を表示できませんでした");
        bundle?.dispose();
      }
    })();
    return () => {
      abort.abort();
      city?.destroy();
      bundle?.dispose();
    };
  }, []);
  return (
    <main>
      <h1>合成 Spine 表示テスト</h1>
      <p>単純な合成素材です。実際のキャラクターや写真からの生成結果ではありません。</p>
      <p role="status">{status}</p>
      <div ref={host} style={{ width: "100%", height: "70vh" }} />
    </main>
  );
}
