"use client";

import { DevelopmentApiError } from "@ai-city/contracts/development-client";
import { createDeviceClient } from "@ai-city/contracts/device-client";
import type { PhotoUploadAdminSettings } from "@ai-city/contracts/spine";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const POLL_MS = 15_000;

/**
 * Photo-upload admission for /join. Mounted only after the administrator is connected, so the
 * first read never happens unauthenticated. This is not the AI dialogue switch: it only decides
 * whether NEW participants may send a photo; queued jobs and published residents are untouched.
 */
export default function PhotoUploadSetting() {
  const api = useMemo(() => createDeviceClient(), []);
  const [settings, setSettings] = useState<PhotoUploadAdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const saveRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const next = await api.photoUploadSettings();
      // Never overwrite the value mid-save; the save response is the newer truth.
      if (!saveRef.current) {
        setSettings(next);
        setError("");
      }
    } catch (failure) {
      if (!saveRef.current)
        setError(
          failure instanceof DevelopmentApiError && failure.status === 401
            ? "管理者の接続が切れました。もう一度接続してください。"
            : "写真アップロードの設定を確認できません。接続を確認してください。",
        );
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function toggle() {
    if (!settings || saving) return;
    const requested = !settings.allowUpload;
    saveRef.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const next = await api.setPhotoUploadAllowed(requested);
      setSettings(next);
      setNotice(
        next.allowUpload
          ? "写真アップロードをオンにしました。新しい参加者が写真を送れます。"
          : "写真アップロードをオフにしました。新しい写真は受け付けません（処理中の参加と公開済みの住民はそのままです）。",
      );
    } catch (failure) {
      setError(
        failure instanceof DevelopmentApiError && failure.status === 401
          ? "管理者の接続が切れました。もう一度接続してください。"
          : "設定を保存できませんでした。現在の設定は変わっていない可能性があります。状態を確認してください。",
      );
    } finally {
      saveRef.current = false;
      setSaving(false);
    }
  }

  const on = settings?.allowUpload ?? false;
  return (
    <section className="flow-panel" aria-labelledby="photo-upload-heading">
      <h2 id="photo-upload-heading">写真アップロードの受付</h2>
      <p role="status" data-testid="photo-upload-status">
        {loading
          ? "状態を確認しています。"
          : !settings
            ? "状態を確認できません。"
            : !settings.available
              ? "この環境では写真アップロードを提供していません（クラウド受付が未設定）。"
              : settings.effective
                ? "現在：受付中（オン）"
                : "現在：受付停止（オフ）"}
      </p>
      <button
        type="button"
        className={on ? "secondary" : ""}
        aria-pressed={on}
        disabled={loading || saving || !settings}
        onClick={() => void toggle()}
      >
        {saving
          ? "保存しています…"
          : on
            ? "写真アップロードをオフにする"
            : "写真アップロードをオンにする"}
      </button>
      {settings && !settings.available && (
        <p className="muted">
          設定は保存できますが、クラウド受付が有効になるまで参加者には表示されません。
        </p>
      )}
      {error && (
        <p className="flow-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="admin-notice" role="status">
          {notice}
        </p>
      )}
      <p className="muted">
        オフにすると /join
        の写真アップロードを止め、「写真なし」の用意されたキャラクターだけを案内します。AI会話の設定とは別です。
        すでに受け付けた写真の処理と公開済みの住民には影響しません。
      </p>
    </section>
  );
}
