"use client";
import type { DeviceAdmin } from "@ai-city/contracts/device-link";
import { useState } from "react";

export default function ManagedResidents({
  residents,
  busy,
  remove,
}: {
  residents: DeviceAdmin["snapshot"]["residents"];
  busy: boolean;
  remove: (ids: string[]) => Promise<string[]>;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("JOINED");
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const currentIds = new Set(residents.map((resident) => resident.residentId));
  const selection = selected.filter((id) => currentIds.has(id));
  const confirmed = confirmIds?.filter((id) => currentIds.has(id)) ?? [];
  const visible = residents.filter((resident) =>
    resident.nickname
      .normalize("NFKC")
      .toLocaleLowerCase("ja-JP")
      .includes(query.trim().normalize("NFKC").toLocaleLowerCase("ja-JP")),
  );
  if (sort === "NAME") visible.sort((a, b) => a.nickname.localeCompare(b.nickname, "ja-JP"));
  if (sort === "REVERSE") visible.reverse();
  async function withdraw(ids: string[]) {
    const remaining = await remove(ids);
    setSelected((previous) => previous.filter((id) => !ids.includes(id) || remaining.includes(id)));
    setConfirmIds(null);
    setRemoveId(null);
  }
  return (
    <section className="flow-panel">
      <h2>
        公開中の住民 <span>{residents.length}人</span>
      </h2>
      <p className="muted">本人が確認して公開した住民の一覧です。見本の住民は含みません。</p>
      {residents.length === 0 ? (
        <p className="muted">まだ住民はいません。参加画面で確認した人だけ表示されます。</p>
      ) : (
        <>
          <div className="admin-filters">
            <label className="field">
              住民を検索
              <input
                type="search"
                value={query}
                maxLength={80}
                disabled={busy}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setConfirmIds(null);
                }}
                placeholder="ニックネーム"
              />
            </label>
            <label className="field">
              並び順
              <select
                value={sort}
                disabled={busy}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="JOINED">参加順</option>
                <option value="REVERSE">参加順（新しい順）</option>
                <option value="NAME">名前順</option>
              </select>
            </label>
          </div>
          <p className="muted">
            表示 {visible.length}人 ／ 選択 {selection.length}人
          </p>
          <div className="admin-actions">
            <button
              type="button"
              className="secondary"
              disabled={busy || !visible.length}
              onClick={() => {
                setSelected(visible.map((resident) => resident.residentId));
                setConfirmIds(null);
              }}
            >
              表示中を選択
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy || !selection.length}
              onClick={() => {
                setSelected([]);
                setConfirmIds(null);
              }}
            >
              選択を解除
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy || !selection.length}
              onClick={() => {
                setConfirmIds(selection);
                setRemoveId(null);
              }}
            >
              選択した住民を削除
            </button>
          </div>
          {confirmed.length > 0 && (
            <fieldset className="admin-confirm" aria-label="選択した住民の削除確認">
              <p>選択した{confirmed.length}人を公開一覧から削除します。元に戻せません。</p>
              <ul>
                {confirmed.map((id) => (
                  <li key={id}>
                    {residents.find((resident) => resident.residentId === id)?.nickname}
                  </li>
                ))}
              </ul>
              <p className="muted">接続中のタブレットにも表示されなくなります。</p>
              <div className="admin-actions">
                <button type="button" disabled={busy} onClick={() => void withdraw(confirmed)}>
                  選択した{confirmed.length}人の削除を確定
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => setConfirmIds(null)}
                >
                  削除をやめる
                </button>
              </div>
            </fieldset>
          )}
          {visible.length === 0 && <p>該当する住民はいません。</p>}
          {visible.map((resident) => (
            <article className="managed-resident" key={resident.residentId}>
              <label className="admin-selection">
                <input
                  type="checkbox"
                  checked={selection.includes(resident.residentId)}
                  disabled={busy}
                  aria-label={`${resident.nickname}を選択`}
                  onChange={(event) => {
                    setSelected(
                      event.target.checked
                        ? [...selection, resident.residentId]
                        : selection.filter((id) => id !== resident.residentId),
                    );
                    setConfirmIds(null);
                  }}
                />
                <strong>{resident.nickname}</strong>
              </label>
              {removeId === resident.residentId ? (
                <div>
                  <p>この住民を街から削除しますか？</p>
                  <div className="admin-actions">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void withdraw([resident.residentId])}
                    >
                      削除を確定
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => setRemoveId(null)}
                    >
                      戻る
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    setRemoveId(resident.residentId);
                    setConfirmIds(null);
                  }}
                >
                  街から削除
                </button>
              )}
            </article>
          ))}
        </>
      )}
    </section>
  );
}
