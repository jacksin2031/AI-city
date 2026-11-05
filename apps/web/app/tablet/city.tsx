"use client";
import {
  closePresentation,
  createDevelopmentCity,
  fetchSpineBundle,
  type IllustratedCity,
  LANDMARKS,
  type Landmark,
  loadChibiDemo,
  openProfile,
  SCENE_RESIDENT_LIMIT,
  type ScenePresentationFrame,
  sceneResidentCount,
  updatePresentation,
} from "@ai-city/city";
import { DialogueResultSchema } from "@ai-city/contracts";
import type { CitySnapshot } from "@ai-city/contracts/development";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LandmarkCard } from "../landmark-card";
import { AutumnFilter, SceneCounts, SceneLogo } from "./hud";
import { ResidentSpeech } from "./resident-speech";
export function TabletCity({
  snapshot,
  motion,
  sample,
  focus,
  reliableFocus,
  onFocusApplied,
  totalParticipants,
  tools,
}: {
  snapshot: CitySnapshot;
  motion: boolean;
  sample: boolean;
  focus: { id: string; residentId: string; expiresAt: number } | null;
  reliableFocus: { requestId: string; residentId: string } | null;
  onFocusApplied: (requestId: string) => Promise<void>;
  /** Running total of public joins; the roster alone would forget withdrawn participants. */
  totalParticipants?: number;
  /** Shows the operator pickers and status line that stay hidden on the public screen. */
  tools: boolean;
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
  const [landmark, setLandmark] = useState<Landmark | null>(null);
  const [dialogueAvailable, setDialogueAvailable] = useState(false);
  const latest = useRef({ snapshot, residents, motion, active: view.active });
  latest.current = { snapshot, residents, motion, active: view.active };
  const select = useCallback((id: string) => {
    setLandmark(null);
    city.current?.selectLandmark(null);
    setPresentation((previous) =>
      openProfile(updatePresentation(previous, latest.current.snapshot), id),
    );
  }, []);
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
  const lastReliableFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !reliableFocus || lastReliableFocus.current === reliableFocus.requestId) return;
    if (!residents.some((resident) => resident.residentId === reliableFocus.residentId)) return;
    lastReliableFocus.current = reliableFocus.requestId;
    select(reliableFocus.residentId);
  }, [ready, reliableFocus, residents, select]);
  useEffect(() => {
    if (!parent.current) return;
    setReady(false);
    setFailed(false);
    setSpineBundles(0);
    let active = true;
    let aiEnabled = false;
    const lifetime = new AbortController();
    let sampleAssets: Awaited<ReturnType<typeof loadChibiDemo>> | undefined;
    const bundleAssets = new Map<string, Awaited<ReturnType<typeof fetchSpineBundle>>>();
    void fetch("/api/link/dialogue", {
      credentials: "same-origin",
      cache: "no-store",
      signal: lifetime.signal,
    })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((value: unknown) => {
        aiEnabled = Boolean(
          value && typeof value === "object" && "available" in value && value.available === true,
        );
        if (active) setDialogueAvailable(aiEnabled);
      })
      .catch(() => {});
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
          onSelectLandmark: (item) => {
            if (!active) return;
            if (item && latest.current.active) close();
            setLandmark(item);
          },
          onEncounter: async (residentIds, place) => {
            if (!aiEnabled || !active) return null;
            const response = await fetch("/api/link/dialogue", {
              method: "POST",
              credentials: "same-origin",
              cache: "no-store",
              headers: { "Content-Type": "application/json" },
              signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(15_000)]),
              body: JSON.stringify({
                schemaVersion: 1,
                requestId: crypto.randomUUID(),
                eventId: latest.current.snapshot.eventId,
                residentIds,
                place,
                locale: "ja-JP",
                maxLines: 4,
              }),
            });
            if (!response.ok) {
              if (response.status === 503) {
                aiEnabled = false;
                if (active) setDialogueAvailable(false);
              }
              return null;
            }
            return DialogueResultSchema.parse(await response.json());
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
  const focusRendered = Boolean(
    ready &&
      reliableFocus &&
      active?.kind === "profile" &&
      active.id === reliableFocus.residentId &&
      anchor?.kind === "profile" &&
      anchor.id === reliableFocus.residentId &&
      anchor.cameraZoom > 1,
  );
  const reliableFocusId = reliableFocus?.requestId;
  useEffect(() => {
    if (!focusRendered || !reliableFocusId) return;
    const requestId = reliableFocusId;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function acknowledge() {
      try {
        await onFocusApplied(requestId);
      } catch {
        if (!stopped) timer = setTimeout(acknowledge, 1000);
      }
    }
    void acknowledge();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [focusRendered, reliableFocusId, onFocusApplied]);
  const resident = residents.find((item) => item.residentId === active?.id);
  // A focused resident outside the drawn limit is added to the scene on top of the cap.
  const focusedOutside = resident && residents.indexOf(resident) >= SCENE_RESIDENT_LIMIT ? 1 : 0;
  const inScene = sceneResidentCount(residents.length) + focusedOutside;
  useEffect(() => {
    if (!active) return;
    setLandmark(null);
    city.current?.selectLandmark(null);
  }, [active]);
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
        aria-label="街の住民や建物をタップすると紹介を表示します。"
      >
        <div className="tablet-scene-canvas" ref={parent} />
        <AutumnFilter animated={animated} />
        <SceneLogo />
        <SceneCounts
          participants={Math.max(totalParticipants ?? 0, residents.length)}
          inScene={inScene}
        />
        {tools && (
          <p className="tablet-dialogue-status">
            {dialogueAvailable ? "架空の住民：AI会話の接続設定あり" : "架空の住民：AI会話は未設定"}
          </p>
        )}
        <p className="canvas-failure" role="alert">
          街を表示できません。ページを読み直してください。
        </p>
        {landmark && (
          <aside className="tablet-landmark">
            <LandmarkCard
              key={landmark.key}
              landmark={landmark}
              close={() => {
                setLandmark(null);
                city.current?.selectLandmark(null);
              }}
            />
          </aside>
        )}
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
      {tools && residents.length > 0 && (
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
      {tools && (
        <details className="tablet-landmark-list">
          <summary>建物・駅を選ぶ</summary>
          <div>
            {LANDMARKS.map((item) => (
              <button
                type="button"
                key={item.key}
                disabled={!ready || failed}
                onClick={() => {
                  if (view.active) close();
                  setLandmark(item);
                  city.current?.selectLandmark(item.id);
                }}
              >
                {item.name}
              </button>
            ))}
          </div>
        </details>
      )}
    </>
  );
}
