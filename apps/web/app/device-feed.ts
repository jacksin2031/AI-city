"use client";
import { DevelopmentApiError } from "@ai-city/contracts/development-client";
import { createDeviceClient } from "@ai-city/contracts/device-client";
import type { DeviceAdmin, DeviceDisplay } from "@ai-city/contracts/device-link";
import { useCallback, useEffect, useRef, useState } from "react";
import { mergeDeviceState } from "./device-state";

type Feeds = { admin: DeviceAdmin; display: DeviceDisplay };
export function useDeviceFeed<K extends keyof Feeds>(role: K) {
  const [state, setState] = useState<Feeds[K] | null>(null);
  const [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [epoch, setEpoch] = useState(0);
  const [lastReceivedAt, setLastReceivedAt] = useState<number | null>(null);
  const api = useRef(createDeviceClient());
  const mounted = useRef(false);
  const accept = useCallback((next: Feeds[K]) => {
    setLastReceivedAt(Date.now());
    setState((previous) => mergeDeviceState(previous, next));
  }, []);
  const reconnect = () => {
    setState(null);
    setLoading(true);
    setError("");
    setEpoch((value) => value + 1);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: epoch deliberately restarts the authenticated connection after login/logout.
  useEffect(() => {
    mounted.current = true;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const lifetime = new AbortController();
    const client = createDeviceClient({ signal: lifetime.signal });
    api.current = client;
    async function refresh() {
      try {
        const next = (await (role === "admin" ? client.admin() : client.display())) as Feeds[K];
        if (active) {
          accept(next);
          setNeedsLogin(false);
          setError("");
        }
      } catch (failure) {
        if (active) {
          setState(null);
          setNeedsLogin(
            failure instanceof DevelopmentApiError && [401, 403].includes(failure.status),
          );
          setError(
            failure instanceof DevelopmentApiError
              ? failure.message
              : "接続できません。表示を止めて再接続しています。",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
          timer = setTimeout(() => void refresh(), 1000);
        }
      }
    }
    void refresh();
    return () => {
      mounted.current = false;
      active = false;
      lifetime.abort();
      clearTimeout(timer);
    };
  }, [role, epoch, accept]);
  return {
    state,
    error,
    setError,
    needsLogin,
    loading,
    api,
    accept,
    reconnect,
    mounted,
    lastReceivedAt,
  };
}
