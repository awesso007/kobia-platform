/*
 * Site block definitions (Sprint 17). Pure, framework-free: the catalog of
 * block types, their human labels, and a default `data` payload per type used
 * when a block is first added in the editor. Imported by both server code and
 * client components, so it must stay free of any "use client" or server-only
 * import.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */

export const SITE_BLOCK_TYPES = [
  "HERO",
  "TEXT",
  "IMAGE",
  "CTA",
  "FEATURES",
  "TESTIMONIAL",
  "FAQ",
  "FORM_EMBED",
  "HTML",
  "SPACER",
  "GALLERY",
  "VIDEO",
] as const;

export type SiteBlockTypeName = (typeof SITE_BLOCK_TYPES)[number];

export const BLOCK_LABELS: Record<SiteBlockTypeName, string> = {
  HERO: "Hero",
  TEXT: "Text",
  IMAGE: "Image",
  CTA: "Call to action",
  FEATURES: "Features",
  TESTIMONIAL: "Testimonial",
  FAQ: "FAQ",
  FORM_EMBED: "Embedded form",
  HTML: "Custom HTML",
  SPACER: "Spacer",
  GALLERY: "Gallery",
  VIDEO: "Video",
};

export const BLOCK_DESCRIPTIONS: Record<SiteBlockTypeName, string> = {
  HERO: "Large headline, subtitle, and a button.",
  TEXT: "A rich paragraph of body copy.",
  IMAGE: "A single image with optional caption.",
  CTA: "A banner with a headline and a button.",
  FEATURES: "A grid of feature cards.",
  TESTIMONIAL: "A customer quote with attribution.",
  FAQ: "A list of question and answer pairs.",
  FORM_EMBED: "Embed one of your web forms.",
  HTML: "Raw HTML for advanced layouts.",
  SPACER: "Vertical whitespace.",
  GALLERY: "A row of images.",
  VIDEO: "An embedded video by URL.",
};

export type FeatureItem = { title: string; body: string; icon?: string };
export type FaqItem = { question: string; answer: string };
export type GalleryImage = { url: string; alt?: string };

/** Shape of the `data` JSON for each block type. All fields optional in storage. */
export type BlockData = {
  // HERO / CTA
  title?: string;
  subtitle?: string;
  buttonLabel?: string;
  buttonHref?: string;
  backgroundUrl?: string;
  // TEXT / HTML
  body?: string;
  html?: string;
  align?: "left" | "center" | "right";
  // IMAGE / VIDEO
  url?: string;
  alt?: string;
  caption?: string;
  // FEATURES
  features?: FeatureItem[];
  // TESTIMONIAL
  quote?: string;
  author?: string;
  role?: string;
  // FAQ
  items?: FaqItem[];
  // FORM_EMBED
  formSlug?: string;
  // SPACER
  height?: number;
  // GALLERY
  images?: GalleryImage[];
};

/** Default `data` payload for a freshly added block of the given type. */
export function defaultBlockData(type: SiteBlockTypeName): BlockData {
  switch (type) {
    case "HERO":
      return { title: "Your headline here", subtitle: "A short supporting sentence.", buttonLabel: "Get started", buttonHref: "#" };
    case "TEXT":
      return { body: "Write your content here.", align: "left" };
    case "IMAGE":
      return { url: "", alt: "", caption: "" };
    case "CTA":
      return { title: "Ready to get started?", buttonLabel: "Contact us", buttonHref: "#" };
    case "FEATURES":
      return {
        title: "Features",
        features: [
          { title: "Fast", body: "Describe this feature." },
          { title: "Reliable", body: "Describe this feature." },
          { title: "Secure", body: "Describe this feature." },
        ],
      };
    case "TESTIMONIAL":
      return { quote: "This product changed how we work.", author: "Jane Doe", role: "CEO, Example Inc" };
    case "FAQ":
      return {
        title: "Frequently asked questions",
        items: [
          { question: "How does it work?", answer: "Explain here." },
          { question: "How much does it cost?", answer: "Explain here." },
        ],
      };
    case "FORM_EMBED":
      return { formSlug: "", title: "Get in touch" };
    case "HTML":
      return { html: "<div>Custom HTML</div>" };
    case "SPACER":
      return { height: 48 };
    case "GALLERY":
      return { images: [] };
    case "VIDEO":
      return { url: "", caption: "" };
    default:
      return {};
  }
}

export function isBlockType(v: unknown): v is SiteBlockTypeName {
  return typeof v === "string" && (SITE_BLOCK_TYPES as readonly string[]).includes(v);
}
