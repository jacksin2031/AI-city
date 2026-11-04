import {
  type createDevelopmentClient,
  DevelopmentApiError,
} from "@ai-city/contracts/development-client";
import { useEffect, useRef, useState } from "react";

export function useReliableFocus(client: ReturnType<typeof createDevelopmentClient>) {
  const id = useRef<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!pending) return;
    const pendingId = pending;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await client.focusStatus(pendingId);
        if (stopped) return;
        if (result.status === "PENDING")
          setMessage("平板での表示を待っています。接続を確認してください。");
        else {
          id.current = null;
          setPending(null);
          setMessage(
            result.status === "APPLIED"
              ? "平板でキャラクターを表示しました。"
              : "平板で表示できませんでした。接続を確認し、もう一度お試しください。",
          );
          return;
        }
      } catch (error) {
        if (
          !stopped &&
          error instanceof DevelopmentApiError &&
          (error.status === 401 || error.status === 404)
        ) {
          id.current = null;
          setPending(null);
          setMessage("リクエストを確認できません。参加情報と接続を確認してください。");
          return;
        }
        if (!stopped) setMessage("接続を確認できません。復旧後に再確認します。");
      }
      if (!stopped) timer = setTimeout(poll, 1000);
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [client, pending]);
  async function send() {
    const requestId = id.current ?? crypto.randomUUID();
    id.current = requestId;
    setBusy(true);
    try {
      const result = await client.requestFocus(requestId);
      if (result.status === "PENDING") {
        setMessage("平板での表示を待っています。接続を確認してください。");
        setPending(requestId);
      } else {
        id.current = null;
        setPending(null);
        setMessage(
          result.status === "APPLIED"
            ? "平板でキャラクターを表示しました。"
            : "平板で表示できませんでした。もう一度お試しください。",
        );
      }
    } catch {
      setMessage("接続を確認できません。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }
  return { send, busy, message };
}
