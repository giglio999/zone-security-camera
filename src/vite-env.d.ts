/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ZONE_ACCESS_CODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
