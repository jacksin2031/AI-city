const MAX_BYTES = 8 * 1024 * 1024;
type Result = { status: "ready"; url: string } | { status: "invalid" | "too-large" | "cancelled" };

/** The controller never sends or stores file contents; URLs are revoked on clear. */
export class LocalPhoto {
  private generation = 0;
  private url: string | null = null;
  constructor(private urls: { create: (file: File) => string; revoke: (url: string) => void }) {}
  clear() {
    this.generation++;
    if (this.url) this.urls.revoke(this.url);
    this.url = null;
  }
  async select(file: File): Promise<Result> {
    this.clear();
    const generation = this.generation;
    if (file.size > MAX_BYTES) return { status: "too-large" };
    if (!file.size || !["image/jpeg", "image/png", "image/webp"].includes(file.type))
      return { status: "invalid" };
    try {
      const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      if (generation !== this.generation) return { status: "cancelled" };
      const jpeg =
        file.type === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const png =
        file.type === "image/png" &&
        [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
      const webp =
        file.type === "image/webp" &&
        [82, 73, 70, 70].every((v, i) => bytes[i] === v) &&
        [87, 69, 66, 80].every((v, i) => bytes[i + 8] === v);
      if (!jpeg && !png && !webp) return { status: "invalid" };
      this.url = this.urls.create(file);
      return { status: "ready", url: this.url };
    } catch {
      return { status: generation === this.generation ? "invalid" : "cancelled" };
    }
  }
}
