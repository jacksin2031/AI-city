"use client";
import {
  closePresentation,
  createDevelopmentCity,
  fetchSpineBundle,
  type IllustratedCity,
  loadChibiDemo,
  openProfile,
  type ScenePresentationFrame,
  updatePresentation,
} from "@ai-city/city";
import type { CitySnapshot } from "@ai-city/contracts/development";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ResidentSpeech } from "./resident-speech";
export function TabletCity({
  snapshot,
  motion,
  sample,
  focus,
}: {
  snapshot: CitySnapshot;
  motion: boolean;
  sample: boolean;
  focus: { id: string; residentId: string; expiresAt: number } | null;
}) {
  const parent = useRef<HTMLDivElement>(null);
  const city = useRef<IllustratedCity | null>(null);
  const [presentation, setPresentation] = useState(() => updatePresentation(null, snapshot));
  const view = useMemo(() => updatePresentation(presentation, snapshot), [presentation, snapshot]);
  const residents = view.roster.residents;
  const spineKey = JSON.stringify(
    snapshot.avatars.flatMap(({ manifest }) =>
      manifest.spine &&
      residents.some((resident) => resident.avatarVersion === manifest.avatarVersion)
        ? [{ version: manifest.avatarVersion, descriptor: manifest.spine }]
        : [],
    ),
  );
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [anchor, setAnchor] = useState<ScenePresentationFrame | null>(null);
  const [animated, setAnimated] = useState(false);
  const [spineSample, setSpineSample] = useState<"loading" | "ready" | "failed" | null>(null);
  const [spineBundles, setSpineBundles] = useState(0);
  const latest = useRef({ snapshot, residents, motion, active: view.active });
  latest.current = { snapshot, residents, motion, active: view.active };
  const select = useCallback(
    (id: string) =>
      setPresentation((previous) =>
        openProfile(updatePresentation(previous, latest.current.snapshot), id),
      ),
    [],
  );
  const close = useCallback(
    () =>
      setPresentation((previous) =>
        closePresentation(updatePresentation(previous, latest.current.snapshot)),
      ),
    [],
  );
  const lastFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!focus || focus.id === lastFocus.current || focus.expiresAt <= Date.now()) return;
    if (!residents.some((resident) => resident.residentId === focus.residentId)) return;
    lastFocus.current = focus.id;
    select(focus.residentId);
  }, [focus, residents, select]);
  useEffect(() => {
    if (!parent.current) return;
    setReady(false);
    setFailed(false);
    setSpineBundles(0);
    let active = true;
    const lifetime = new AbortController();
    let sampleAssets: Awaited<ReturnType<typeof loadChibiDemo>> | undefined;
    const bundleAssets = new Map<string, Awaited<ReturnType<typeof fetchSpineBundle>>>();
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const applyMotion = () => {
      const enabled = latest.current.motion && !media.matches;
      setAnimated(enabled);
      city.current?.setMotionEnabled(enabled);
    };
    applyMotion();
    media.addEventListener("change", applyMotion);
    const container = parent.current;
    const loadSample = sample
      ? loadChibiDemo(lifetime.signal)
          .then((assets) => {
            if (!active) {
              assets.dispose();
              return undefined;
            }
            sampleAssets = assets;
            return assets;
          })
          .catch(() => {
            if (active) setSpineSample("failed");
            return undefined;
          })
      : Promise.resolve(undefined);
    if (sample) setSpineSample("loading");
    else setSpineSample(null);
    const descriptors: Array<{
      version: string;
      descriptor: NonNullable<CitySnapshot["avatars"][number]["manifest"]["spine"]>;
    }> = JSON.parse(spineKey);
    const loadBundles = Promise.all(
      descriptors.map(async ({ version, descriptor }) => {
        try {
          const assets = await fetchSpineBundle(descriptor, lifetime.signal);
          if (!active) assets.dispose();
          else bundleAssets.set(version, assets);
        } catch {
          // An unavailable or invalid bundle falls back to the existing illustration.
        }
      }),
    );
    Promise.all([loadSample, loadBundles])
      .then(([assets]) => {
        if (!active) return;
        const sampleId = latest.current.residents[0]?.residentId;
        let bundlePlayers = 0;
        return createDevelopmentCity(container, {
          residents: latest.current.residents,
          fillViewport: true,
          motionEnabled: latest.current.motion && !media.matches,
          signal: lifetime.signal,
          createAnimatedCharacter: (resident) => {
            try {
              const bundle = bundleAssets.get(resident.avatarVersion);
              if (bundle) {
                const player = bundle.create();
                bundlePlayers += 1;
                return player;
              }
              return assets && resident.residentId === sampleId ? assets.create() : null;
            } catch {
              return null;
            }
          },
          onSelect: (id) => {
            if (active) select(id);
          },
          onClearSelection: () => {
            if (active && latest.current.active) close();
          },
          onPresentationFrame: (frame) => {
            if (active) setAnchor(frame);
          },
          onReady: () => {
            if (active) {
              setSpineBundles(bundlePlayers);
              setReady(true);
            }
          },
        });
      })
      .then((instance) => {
        if (!instance) return;
        if (!active) instance.destroy();
        else {
          city.current = instance;
          if (sampleAssets) setSpineSample("ready");
          instance.setResidents(latest.current.residents);
          instance.select(latest.current.active?.id ?? null);
          instance.present(latest.current.active);
          applyMotion();
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      lifetime.abort();
      media.removeEventListener("change", applyMotion);
      city.current?.destroy();
      city.current = null;
      sampleAssets?.dispose();
      for (const assets of bundleAssets.values()) assets.dispose();
    };
  }, [select, close, sample, spineKey]);
  useEffect(() => {
    setPresentation((previous) => updatePresentation(previous, snapshot));
  }, [snapshot]);
  useEffect(() => {
    city.current?.setResidents(residents);
    const enabled = motion && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    setAnimated(enabled);
    city.current?.setMotionEnabled(enabled);
  }, [residents, motion]);
  const active = view.active;
  const resident = residents.find((item) => item.residentId === active?.id);
  useEffect(() => {
    if (!ready) return;
    city.current?.select(active?.id ?? null);
    city.current?.present(active);
  }, [active, ready]);
  useEffect(() => {
    const welcomeId = active?.kind === "welcome" ? active.id : null;
    if (!welcomeId) return;
    const timer = setTimeout(
      () =>
        setPresentation((previous) => {
          const current = updatePresentation(previous, latest.current.snapshot);
          return current.active?.kind === "welcome" && current.active.id === welcomeId
            ? closePresentation(current)
            : current;
        }),
      3000,
    );
    return () => clearTimeout(timer);
  }, [active?.id, active?.kind]);
  return (
    <>
      <section
        className="tablet-city"
        data-ready={ready}
        data-failed={failed || undefined}
        data-spine-sample={spineSample ?? undefined}
        data-spine-bundles={spineBundles}
        aria-label="街の住民をタップすると公開プロフィールを表示します。"
      >
        <div className="tablet-scene-canvas" ref={parent} />
        <p className="canvas-failure" role="alert">
          街を表示できません。ページを読み直してください。
        </p>
        {resident && active && anchor?.id === active.id && anchor.kind === active.kind && (
          <ResidentSpeech
            key={`${active.kind}:${active.id}`}
            resident={resident}
            anchor={anchor}
            animated={animated}
            sample={sample}
            close={close}
            showProfile={() => select(resident.residentId)}
          />
        )}
      </section>
      {spineSample === "failed" && (
        <p role="status">公式サンプルを読み込めなかったため、見本イラストを表示しています。</p>
      )}
      {residents.length > 0 && (
        <details className="tablet-resident-list">
          <summary>住民のプロフィールを選ぶ</summary>
          <div className="tablet-resident-buttons">
            {residents.map((item) => (
              <button type="button" key={item.residentId} onClick={() => select(item.residentId)}>
                {item.nickname}のプロフィール
              </button>
            ))}
          </div>
        </details>
      )}
    </>
  );
}
