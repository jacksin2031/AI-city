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
        Spine公式の非商用サンプルです。AI生成ではなく、参加者の一覧には入りません。
        再起動すると見本の選択は消えます。
      </p>
      <p className="muted">
        画面に表示できるのは最大20人です。参加者を優先するため、人数によっては見本が表示されない場合があります。
      </p>
      <div className="preset-list">
        {PRESET_CHARACTERS.map((preset) => {
          const count = selected.filter((id) => id === preset.id).length;
          return (
            <div className="preset-row" key={preset.id}>
              <div>
                <strong>
                  見本・{preset.name}（{preset.officialSkin}）
                </strong>
                <p>
                  {preset.personality}・{preset.interest} ／ {count}人
                </p>
              </div>
              <button
                type="button"
                disabled={busy || availableSlots <= 0}
                aria-label={`見本・${preset.name}を街に追加`}
                onClick={() => toggle(preset.id, true)}
              >
                街に追加
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy || count === 0}
                aria-label={`見本・${preset.name}を街から外す`}
                onClick={() => toggle(preset.id, false)}
              >
                街から外す
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
