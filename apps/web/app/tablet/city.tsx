"use client";
import {
  closePresentation,
  createDevelopmentCity,
  type IllustratedCity,
  openProfile,
  updatePresentation,
} from "@ai-city/city";
import type { CitySnapshot } from "@ai-city/contracts/development";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ResidentCard } from "./resident-card";
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
  const [animated, setAnimated] = useState(false);
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
  useEffect(() => {
    if (!parent.current) return;
    let active = true;
    const lifetime = new AbortController();
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
      motionEnabled: latest.current.motion && !media.matches,
      signal: lifetime.signal,
      onSelect: (id) => {
        if (active) select(id);
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
          applyMotion();
        }
      })
      .catch(() => {
        if (active) parent.current?.setAttribute("data-failed", "true");
      });
    return () => {
      active = false;
      lifetime.abort();
      media.removeEventListener("change", applyMotion);
      city.current?.destroy();
      city.current = null;
    };
  }, [select]);
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
    if (active?.kind === "welcome" && animated) city.current?.act(active.id, "wave");
    else if (active?.kind === "profile") city.current?.act(active.id, "idle");
  }, [active?.id, active?.kind, animated, ready]);
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
        ref={parent}
        data-ready={ready}
        aria-label="街の住民をタップすると公開プロフィールを表示します。"
      >
        <p className="canvas-failure" role="alert">
          街を表示できません。ページを読み直してください。
        </p>
      </section>
      {resident && active && (
        <ResidentCard
          key={`${active.kind}:${active.id}`}
          resident={resident}
          kind={active.kind}
          animated={animated}
          sample={sample}
          close={close}
          showProfile={() => select(resident.residentId)}
        />
      )}
      {residents.length > 0 && (
        <details className="tablet-resident-list">
          <summary>住民のプロフィールを選ぶ</summary>
          <div>
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
