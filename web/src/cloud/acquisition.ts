// Spec 022: where a person came from. The first touch is kept in the browser through the sign-up and handed to the service once the person is
// signed in. The service keeps the first report and ignores the rest, so telling it twice is harmless.
import { api } from "./api";
import { storage } from "../shell/storage";

const KEY = "sr-acquisition";
const KEEP_MS = 30 * 24 * 3600 * 1000;
const CHANNEL = /^[a-z0-9][a-z0-9_:.-]{0,59}$/;
type Door = "code" | "idea";
interface Touch { channel: string; door?: Door; at: number }

/** The channel named by a link: `?utm_source=` (or `?src=`), `?ref=` for a person's link. Anything that is not a short lowercase label is dropped. */
export function channelFromSearch(search: string): string | null {
  const q = new URLSearchParams(search);
  const raw = (q.get("utm_source") ?? q.get("src") ?? "").trim().toLowerCase();
  const medium = (q.get("utm_medium") ?? "").trim().toLowerCase();
  const channel = medium && raw && CHANNEL.test(`${raw}:${medium}`) ? `${raw}:${medium}` : raw;
  return CHANNEL.test(channel) ? channel : null;
}

const doorFromSearch = (search: string): Door | undefined => {
  const d = new URLSearchParams(search).get("door");
  return d === "code" || d === "idea" ? d : undefined;
};

function read(now: number): Touch | null {
  const raw = storage.get(KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Touch>;
    if (typeof v.channel === "string" && CHANNEL.test(v.channel) && typeof v.at === "number" && now - v.at < KEEP_MS) return v as Touch;
  } catch {
    /* a damaged value is dropped */
  }
  storage.remove(KEY);
  return null;
}

/** Called on every page load of the app. Remembers the FIRST touch only: a later visit by another link does not replace it. */
export function captureAcquisition(search: string = window.location.search, now = Date.now()): void {
  if (read(now)) return;
  const channel = channelFromSearch(search);
  if (channel) storage.set(KEY, JSON.stringify({ channel, door: doorFromSearch(search), at: now } satisfies Touch));
}

/** A referral link is a channel of its own (and the more precise one than any utm that came with it). */
export function captureReferralTouch(now = Date.now()): void {
  if (!read(now)) storage.set(KEY, JSON.stringify({ channel: "referral", at: now } satisfies Touch));
}

/**
 * Hands the kept touch to the service. With none kept, a person who is about to create their first company (`isNewAccount`) is a direct visit;
 * for someone who already had an account nothing is sent, so they are not wrongly counted as direct. A network failure keeps it for next time.
 */
export async function reportAcquisition(isNewAccount: boolean, now = Date.now()): Promise<void> {
  const touch = read(now);
  if (!touch && !isNewAccount) return;
  try {
    await api("/api/acquisition", { body: { channel: touch?.channel ?? "direct", ...(touch?.door ? { door: touch.door } : {}) } });
    storage.remove(KEY);
  } catch {
    /* kept for the next time */
  }
}
