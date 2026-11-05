import type { Metadata } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";
import "./styles.css";

export const metadata: Metadata = {
  title: "バーチャル御茶ノ水～もうひとりの自分が暮らす街～ 開発プレビュー",
  description: "AIの力を体験する街。開発用のサンプルです。",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Render per request so Next.js can attach the CSP nonce from proxy.ts.
  await connection();
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
