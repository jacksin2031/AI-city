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
import { officialSkinFor } from "./official-skin";
import { ResidentSpeech } from "./resident-speech";
import { spineBundleKey, staleSpineVersions } from "./spine-key";

export function TabletCity({
  snapshot,
  motion,
  dialogueEnabled,
  sample,
  focus,
  reliableFocus,
  onFocusApplied,
  totalParticipants,
  tools,
}: {
  snapshot: CitySnapshot;
  motion: boolean;
  dialogueEnabled: boolean;
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
  const hasPresetResidents = residents.some((resident) => officialSkinFor(resident) !== null);
  // Which Spine bundles the current roster needs. Residents come and go, so this list changes
  // often — it must only top up the loaded bundles, never restart the scene.
  const spineDescriptors: Array<{
    version: string;
    descriptor: NonNullable<CitySnapshot["avatars"][number]["manifest"]["spine"]>;
  }> = useMemo(
    () =>
      snapshot.avatars.flatMap(({ manifest }) =>
        manifest.spine &&
        residents.some((resident) => resident.avatarVersion === manifest.avatarVersion)
          ? [{ version: manifest.avatarVersion, descriptor: manifest.spine }]
          : [],
      ),
    [snapshot.avatars, residents],
  );
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [anchor, setAnchor] = useState<ScenePresentationFrame | null>(null);
  const [animated, setAnimated] = useState(false);
  const [sound, setSound] = useState(false);
  const [spineSample, setSpineSample] = useState<"loading" | "ready" | "failed" | null>(null);
  const [spineBundles, setSpineBundles] = useState(0);
  const [landmark, setLandmark] = useState<Landmark | null>(null);
  const [dialogueAvailable, setDialogueAvailable] = useState(false);
  const dialogueAllowed = useRef(dialogueEnabled);
  const dialogueReady = useRef(false);
  dialogueAllowed.current = dialogueEnabled;
  // Loaded Spine bundles live as long as the scene does, keyed by avatar version. They are
  // filled in independently of the scene so a resident leaving never rebuilds the world.
  const bundleAssets = useRef(new Map<string, Awaited<ReturnType<typeof fetchSpineBundle>>>());
  const bundleLifetime = useRef<AbortController | null>(null);
  // Key each live player was built with (version + adjustment); the bundle files are shared.
  const playerKeys = useRef(new Map<string, string>());
  const latest = useRef({ snapshot, residents, motion, active: view.active });
  latest.current = { snapshot, residents, motion, active: view.active };
  // Recheck dialogue availability on toggle without recreating the 3D city scene.
  useEffect(() => {
    if (!dialogueEnabled) {
      dialogueReady.current = false;
      setDialogueAvailable(false);
      return;
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function check() {
      let available = false;
      try {
        const response = await fetch("/api/link/dialogue", {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        const value: unknown = response.ok ? await response.json() : null;
        available = Boolean(
          value && typeof value === "object" && "available" in value && value.available === true,
        );
      } catch {
        // A failed probe is not evidence that the dialogue provider is available.
      } finally {
        if (!controller.signal.aborted) {
          dialogueReady.current = available;
          setDialogueAvailable(available);
          timer = setTimeout(() => void check(), 10_000);
        }
      }
    }
    void check();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [dialogueEnabled]);
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
    const lifetime = new AbortController();
    let sampleAssets: Awaited<ReturnType<typeof loadChibiDemo>> | undefined;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const applyMotion = () => {
      const enabled = latest.current.motion && !media.matches;
      setAnimated(enabled);
      city.current?.setMotionEnabled(enabled);
    };
    applyMotion();
    media.addEventListener("change", applyMotion);
    const container = parent.current;
    const loadSample =
      sample || hasPresetResidents
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
    if (sample || hasPresetResidents) setSpineSample("loading");
    else setSpineSample(null);
    // Bundles are loaded by their own effect, so the scene never waits on the network for
    // someone who just left. Anything already loaded is used immediately.
    Promise.all([loadSample])
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
              const bundle = bundleAssets.current.get(resident.avatarVersion);
              if (bundle) {
                const adjustment = latest.current.snapshot.avatars.find(
                  ({ manifest }) => manifest.avatarVersion === resident.avatarVersion,
                )?.manifest.adjustment;
                const player = bundle.create(adjustment);
                playerKeys.current.set(
                  resident.avatarVersion,
                  spineBundleKey(resident.avatarVersion, adjustment),
                );
                bundlePlayers += 1;
                return player;
              }
              const skin = officialSkinFor(resident);
              if (assets && skin) return assets.create(skin);
              // A participant's own character is still loading: never borrow the sample figure.
              if (
                latest.current.snapshot.avatars.some(
                  ({ manifest }) =>
                    manifest.spine && manifest.avatarVersion === resident.avatarVersion,
                )
              )
                return null;
              return assets && sample && resident.residentId === sampleId ? assets.create() : null;
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
            if (!active || !dialogueAllowed.current || !dialogueReady.current) return null;
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
                dialogueReady.current = false;
                if (active) setDialogueAvailable(false);
              }
              return null;
            }
            const result = DialogueResultSchema.parse(await response.json());
            return dialogueAllowed.current && active ? result : null;
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
      setSound(false);
      sampleAssets?.dispose();
      bundleLifetime.current?.abort();
      bundleLifetime.current = null;
      for (const assets of bundleAssets.current.values()) assets.dispose();
      bundleAssets.current.clear();
      playerKeys.current.clear();
    };
  }, [select, close, sample, hasPresetResidents]);
  // A saved adjustment arrives with the next snapshot poll: recreate only the affected
  // players. The loaded bundle files stay as they are and the scene is not restarted.
  useEffect(() => {
    const stale = staleSpineVersions(playerKeys.current, snapshot.avatars).filter((version) =>
      bundleAssets.current.has(version),
    );
    if (!stale.length) return;
    for (const version of stale) playerKeys.current.delete(version);
    city.current?.rebuildCharacters(stale);
  }, [snapshot.avatars]);
  useEffect(() => {
    setPresentation((previous) => updatePresentation(previous, snapshot));
  }, [snapshot]);
  // Top up the Spine bundles the roster needs. A resident leaving simply drops out of this
  // list; the scene keeps running and the character plays its own departure animation.
  useEffect(() => {
    if (!ready) return;
    const missing = spineDescriptors.filter((item) => !bundleAssets.current.has(item.version));
    if (!missing.length) return;
    const controller = new AbortController();
    bundleLifetime.current = controller;
    let live = true;
    void Promise.all(
      missing.map(async ({ version, descriptor }) => {
        // A bundle can be briefly unavailable right after publishing, so retry a few times
        // instead of waiting for the next roster change.
        for (const delay of [0, 2000, 5000, 10000]) {
          if (delay) {
            await new Promise((resolve) => setTimeout(resolve, delay));
            if (!live || controller.signal.aborted) return;
          }
          try {
            const assets = await fetchSpineBundle(descriptor, controller.signal);
            if (!live || controller.signal.aborted) assets.dispose();
            else bundleAssets.current.set(version, assets);
            return;
          } catch {
            // Keep the illustration fallback until a retry succeeds.
          }
        }
      }),
    ).then(() => {
      if (!live || controller.signal.aborted) return;
      // Residents now have real art: refresh them in place, without rebuilding the scene.
      const loaded = spineDescriptors.filter((item) =>
        bundleAssets.current.has(item.version),
      ).length;
      setSpineBundles(loaded);
      city.current?.setResidents(latest.current.residents);
      // Residents that appeared before their art was ready pick it up in place.
      city.current?.refreshCharacters();
    });
    return () => {
      live = false;
      controller.abort();
    };
  }, [ready, spineDescriptors]);
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
        <button
          type="button"
          className="sound-toggle"
          aria-pressed={sound}
          disabled={!ready}
          onClick={() => {
            const next = !sound;
            setSound(next);
            // Called directly from the tap: browsers only allow sound after a user gesture.
            void city.current?.setSoundEnabled(next);
          }}
        >
          <span aria-hidden="true">{sound ? "🔊" : "🔈"}</span>
          {sound ? "街の音：オン" : "街の音：オフ"}
        </button>
        <SceneCounts participants={totalParticipants ?? residents.length} inScene={inScene} />
        {tools && (
          <p className="tablet-dialogue-status">
            {!dialogueEnabled
              ? "架空の住民：AI会話は停止中"
              : dialogueAvailable
                ? "架空の住民：AI会話の接続設定あり"
                : "架空の住民：AI会話は未設定"}
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
