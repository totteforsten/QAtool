export type Severity = "critical" | "warning" | "info";

export type Category = "seo" | "responsive" | "accessibility" | "meta";

export type PatchType =
  | "alt-text"
  | "meta-title"
  | "meta-description"
  | "add-viewport"
  | "image-dimensions"
  | "canonical";

export interface PatchHint {
  type: PatchType;
  target: string;
  value?: string;
  suggestion?: string;
}

export interface Finding {
  id: string;
  category: Category;
  severity: Severity;
  code: string;
  message: string;
  element?: {
    tag?: string;
    selector?: string;
    snippet?: string;
    attributes?: Record<string, string | undefined>;
  };
  patch?: PatchHint;
}

export interface PlatformInfo {
  wordpress: boolean;
  elementor: boolean;
  breakdance: boolean;
  seoPlugin?: "yoast" | "rankmath" | "seopress" | "aioseo" | null;
}

export interface PageMeta {
  title?: string;
  description?: string;
  h1s: string[];
  canonical?: string;
  viewport?: string;
  lang?: string;
  robots?: string;
}

export interface LinkSummary {
  url: string;
  status: number;
  ok: boolean;
  label?: string;
  error?: string;
}

export interface PageReport {
  url: string;
  fetchedAt: string;
  status: number;
  durationMs: number;
  platform: PlatformInfo;
  meta: PageMeta;
  findings: Finding[];
  score: { seo: number; responsive: number };
  links?: LinkSummary[];
  viewports?: Array<{ viewport: string; width: number; height: number; findingCount: number }>;
}

export interface DiscoverResult {
  urls: string[];
  source: "sitemap" | "homepage" | "manual";
  notes?: string;
}
