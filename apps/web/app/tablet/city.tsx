"use client";
import {
  closePresentation,
  createDevelopmentCity,
  type IllustratedCity,
  LANDMARKS,
  type Landmark,
  openProfile,
  type ScenePresentationFrame,
  updatePresentation,
} from "@ai-city/city";
import { DialogueResultSchema } from "@ai-city/contracts";
import type { CitySnapshot } from "@ai-city/contracts/development";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LandmarkCard } from "../landmark-card";
import { ResidentSpeech } from "./resident-speech";
export function TabletCity({
  snapshot,
  motion,
  sample,
}: {
  snapshot: CitySnapshot;
  motion: boolean;
  sample: boolean;
}) {
  const parent = useRef<HTMLDivElement>(null);
  const city = useRef<IllustratedCity | null>(null);
  const [presentation, setPresentation] = useState(() => updatePresentation(null, snapshot));
  const view = useMemo(() => updatePresentation(presentation, snapshot), [presentation, snapshot]);
  const residents = view.roster.residents;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [anchor, setAnchor] = useState<ScenePresentationFrame | null>(null);
  const [animated, setAnimated] = useState(false);
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
  useEffect(() => {
    if (!parent.current) return;
    let active = true;
    let aiEnabled = false;
    const lifetime = new AbortController();
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
    createDevelopmentCity(parent.current, {
      residents: latest.current.residents,
      fillViewport: true,
      motionEnabled: latest.current.motion && !media.matches,
      signal: lifetime.signal,
      onSelect: (id) => {
        if (active) select(id);
      },
      onSelectLandmark: (item) => {
        if (!active) return;
        if (item && latest.current.active) close();
        setLandmark(item);
      },
      onEncounter: async (residentIds) => {
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
        if (active) setReady(true);
      },
    })
      .then((instance) => {
        if (!active) instance.destroy();
        else {
          city.current = instance;
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
    };
  }, [select, close]);
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
        aria-label="街の住民や建物をタップすると紹介を表示します。"
      >
        <div className="tablet-scene-canvas" ref={parent} />
        <p className="tablet-dialogue-status">
          {dialogueAvailable ? "架空の住民：AI会話の接続設定あり" : "架空の住民：AI会話は未設定"}
        </p>
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
    </>
  );
}
