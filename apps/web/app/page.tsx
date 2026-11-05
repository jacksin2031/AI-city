import { Consent } from "./consent";
import { ParticipantShell } from "./participant-shell";

export default function Home() {
  return (
    <ParticipantShell
      eyebrow="AI体験展示"
      title={
        <>
          <span className="title-main">バーチャル御茶ノ水</span>
          <span className="title-sub">～もうひとりの自分が暮らす街～</span>
        </>
      }
      lead="写真から生まれたあなたの分身が、この街で暮らします。"
    >
      <Consent />
    </ParticipantShell>
  );
}
