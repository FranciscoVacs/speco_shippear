import { ScanSearch } from "lucide-react";

/** Product mark: a rounded square with a scanning glyph. */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <span className="logo-mark" style={{ width: size, height: size, borderRadius: Math.round(size * 0.28) }} aria-hidden="true">
      <ScanSearch size={Math.round(size * 0.62)} />
    </span>
  );
}
