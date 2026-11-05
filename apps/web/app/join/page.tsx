import { ParticipantFlow } from "../participant-flow";
import { ParticipantShell } from "../participant-shell";

export default function Join() {
  return (
    <ParticipantShell
      eyebrow="参加の流れ・体験版"
      title="バーチャル御茶ノ水への参加"
      lead="街に参加するまでの流れを体験できます。"
    >
      <ParticipantFlow />
    </ParticipantShell>
  );
}
