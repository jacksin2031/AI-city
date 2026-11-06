import Link from "next/link";

/** Shown instead of the photo steps while an administrator has paused new photo uploads. */
export function PhotoUploadPaused({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <section role="status" aria-live="polite" data-testid="photo-upload-paused">
      <h2>現在、写真の受付を停止しています</h2>
      <p>
        運営の都合により、写真からキャラクターを作る受付をいったんお休みしています。写真は送信されません。
      </p>
      <p>
        写真なしで、用意されたキャラクターから選んですぐに参加できます。受付が再開されると、このページで写真の送信が選べるようになります。
      </p>
      <Link className="pf-primary" href="/join?mode=sample" onClick={onNavigate}>
        写真なしで、用意されたキャラクターで参加する
      </Link>
    </section>
  );
}
