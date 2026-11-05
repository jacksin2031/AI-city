import type { ReactNode } from "react";
import { CityScene } from "./city-scene";
import { SiteHeader } from "./site-header";

/** Single-screen phone layout: animated city backdrop on top, a bottom sheet for the task. */
export function ParticipantShell({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  lead: string;
  children: ReactNode;
}) {
  return (
    <main className="entry">
      <div className="scene">
        <CityScene />
        <SiteHeader />
        <div className="scene-copy">
          <p className="eyebrow reveal">{eyebrow}</p>
          <h1 className="reveal">{title}</h1>
          <p className="lead reveal">{lead}</p>
        </div>
      </div>
      <div className="sheet">{children}</div>
    </main>
  );
}
