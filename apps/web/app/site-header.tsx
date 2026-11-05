import Link from "next/link";

// The page title already carries the full name, so the header only shows the mark.
export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="バーチャル御茶ノ水 トップへ">
        <span className="brand-mark" aria-hidden="true" />
      </Link>
      <span className="badge">開発プレビュー</span>
    </header>
  );
}
