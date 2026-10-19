"use client";
import { createDevelopmentCity, type IllustratedCity } from "@ai-city/city";
import type { PublicResident } from "@ai-city/contracts";
import { useEffect, useRef } from "react";
export function TabletCity({
  residents,
  motion,
}: {
  residents: PublicResident[];
  motion: boolean;
}) {
  const parent = useRef<HTMLDivElement>(null);
  const city = useRef<IllustratedCity | null>(null);
  const latest = useRef({ residents, motion });
  latest.current = { residents, motion };
  useEffect(() => {
    if (!parent.current) return;
    let active = true;
    const lifetime = new AbortController();
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const applyMotion = () =>
      city.current?.setMotionEnabled(latest.current.motion && !media.matches);
    media.addEventListener("change", applyMotion);
    createDevelopmentCity(parent.current, {
      residents: latest.current.residents,
      motionEnabled: latest.current.motion && !media.matches,
      signal: lifetime.signal,
    })
      .then((instance) => {
        if (!active) instance.destroy();
        else {
          city.current = instance;
          instance.setResidents(latest.current.residents);
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
  }, []);
  useEffect(() => {
    city.current?.setResidents(residents);
    city.current?.setMotionEnabled(
      motion && !matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
  }, [residents, motion]);
  return (
    <section className="tablet-city" ref={parent} aria-label="街の展示。管理はスマホから行います。">
      <p className="canvas-failure" role="alert">
        街を表示できません。ページを読み直してください。
      </p>
    </section>
  );
}
