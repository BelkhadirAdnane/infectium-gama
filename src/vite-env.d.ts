/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** Clé de quota api.nasa.gov (PUBLIQUE, compilée dans le bundle). */
  readonly VITE_NASA_API_KEY: string;
  /** Proxy serveur optionnel : /.netlify/functions/nasa */
  readonly VITE_NASA_PROXY?: string;
}
