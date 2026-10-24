/// <reference types="vite/client" />
/** true only in a build given the three cloud addresses (see vite.config.ts) */
declare const __CLOUD_BUILD__: boolean;
interface ImportMetaEnv {
  /** public address of the Speco cloud service; with the two below it switches the app into cloud mode (spec 015) */
  readonly VITE_CLOUD_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase "anon" key: public by design, row level security does the protecting */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_UPGRADE_URL?: string;
}
