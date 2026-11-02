"use client";
import { type DevicePresetId, PRESET_CHARACTERS } from "@ai-city/contracts/device-link";

/** Fictional characters are managed separately from participants who published themselves. */
export default function PresetResidents({
  selected,
  availableSlots,
  busy,
  toggle,
}: {
  selected: DevicePresetId[];
  availableSlots: number;
  busy: boolean;
  toggle: (id: DevicePresetId, enabled: boolean) => void;
}) {
  return (
    <section className="flow-panel">
      <h2>見本の住民を追加</h2>
      <p className="muted">
        架空の人物です。AI生成やリアルタイム会話ではありません。参加者の一覧には入りません。
        再起動すると見本の選択は消えます。
      </p>
      <p className="muted">
        画面に表示できるのは最大20人です。参加者を優先するため、人数によっては見本が表示されない場合があります。
      </p>
      <div className="preset-list">
        {PRESET_CHARACTERS.map((preset) => {
          const enabled = selected.includes(preset.id);
          return (
            <div className="preset-row" key={preset.id}>
              <div>
                <strong>見本・{preset.name}</strong>
                <p>
                  {preset.personality}・{preset.interest}
                </p>
              </div>
              <button
                type="button"
                className={enabled ? "secondary" : undefined}
                disabled={busy || (!enabled && availableSlots <= 0)}
                aria-label={`見本・${preset.name}を${enabled ? "街から外す" : "街に追加"}`}
                onClick={() => toggle(preset.id, !enabled)}
              >
                {enabled ? "街から外す" : "街に追加"}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
