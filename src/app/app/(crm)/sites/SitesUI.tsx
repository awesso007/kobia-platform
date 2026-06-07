"use client";

/*
 * Sites module client components (Sprint 17). Shared layout primitives plus the
 * interactive surfaces (new-site wizard, publish toggle, pages manager, block
 * editor, theme editor, domains manager). Pure presentational helpers and
 * formatters live in @/lib/sites/site-utils (no "use client") so they can be
 * shared with the public server renderer.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  SITE_BLOCK_TYPES,
  BLOCK_LABELS,
  BLOCK_DESCRIPTIONS,
  defaultBlockData,
  type SiteBlockTypeName,
  type BlockData,
} from "@/lib/sites/blocks";
import { DEFAULT_THEME_TOKENS, resolveThemeTokens, type ThemeTokens } from "@/lib/sites/site-utils";
import {
  createSiteAction,
  setSitePublishedAction,
  deleteSiteAction,
  updateSiteAction,
  createPageAction,
  publishPageAction,
  deletePageAction,
  setHomePageAction,
  createBlockAction,
  updateBlockAction,
  deleteBlockAction,
  reorderBlocksAction,
  addDomainAction,
  deleteDomainAction,
} from "./actions";

// ----------------------------------------------------------- Layout primitives

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--kb-text-primary)" }}>
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm" style={{ color: "var(--kb-text-secondary)" }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={className}
      style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)" }}
    >
      {children}
    </div>
  );
}

export function EmptyState({ message, cta }: { message: string; cta?: React.ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>
        {message}
      </p>
      {cta ? <div className="mt-4 flex justify-center">{cta}</div> : null}
    </div>
  );
}

export function RowLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium hover:underline" style={{ color: "var(--kb-primary)" }}>
      {children}
    </Link>
  );
}

export function StatusBadge({ published }: { published: boolean }) {
  const color = published ? "#5cb85c" : "#828282";
  return (
    <span
      className="inline-block rounded px-2 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: `${color}1a`, color, borderRadius: "var(--kb-radius-sm)" }}
    >
      {published ? "Published" : "Draft"}
    </span>
  );
}

function PrimaryButton({ children, onClick, disabled, type = "button" }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center rounded px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
      style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)" }}
    >
      {children}
    </button>
  );
}

function GhostButton({ children, onClick, danger }: { children: React.ReactNode; onClick?: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center rounded px-3 py-1.5 text-sm font-medium"
      style={{ border: "1px solid var(--kb-border)", color: danger ? "#d9534f" : "var(--kb-text-primary)", borderRadius: "var(--kb-radius-sm)" }}
    >
      {children}
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--kb-border)",
  borderRadius: "var(--kb-radius-sm)",
  backgroundColor: "var(--kb-surface)",
  color: "var(--kb-text-primary)",
};

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full px-3 py-2 text-sm ${props.className ?? ""}`} style={{ ...inputStyle, ...(props.style ?? {}) }} />;
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`w-full px-3 py-2 text-sm ${props.className ?? ""}`} style={{ ...inputStyle, ...(props.style ?? {}) }} />;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium" style={{ color: "var(--kb-text-secondary)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

export function SiteTabs({ siteId, active }: { siteId: string; active: string }) {
  const tabs = [
    { key: "overview", label: "Overview", href: `/app/sites/${siteId}` },
    { key: "pages", label: "Pages", href: `/app/sites/${siteId}/pages` },
    { key: "theme", label: "Theme", href: `/app/sites/${siteId}/theme` },
    { key: "domains", label: "Domains", href: `/app/sites/${siteId}/domains` },
    { key: "analytics", label: "Analytics", href: `/app/sites/${siteId}/analytics` },
  ];
  return (
    <div className="mb-6 flex gap-1 border-b" style={{ borderColor: "var(--kb-border)" }}>
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className="px-3 py-2 text-sm font-medium"
          style={{
            color: active === t.key ? "var(--kb-primary)" : "var(--kb-text-secondary)",
            borderBottom: active === t.key ? "2px solid var(--kb-primary)" : "2px solid transparent",
          }}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

// ----------------------------------------------------------- New site wizard

export function NewSiteForm({ themes }: { themes: { id: string; name: string; isDefault: boolean }[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [themeId, setThemeId] = useState(themes.find((t) => t.isDefault)?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    start(async () => {
      try {
        const id = await createSiteAction({ name, slug: slug || null, description: description || null, themeId: themeId || null });
        router.push(`/app/sites/${id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not create site.");
      }
    });
  }

  return (
    <Card className="max-w-lg p-6">
      <div className="space-y-4">
        <Field label="Site name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Marketing" />
        </Field>
        <Field label="Slug (optional)">
          <TextInput value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="acme-marketing" />
        </Field>
        <Field label="Description (optional)">
          <TextArea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </Field>
        <Field label="Theme">
          <select value={themeId} onChange={(e) => setThemeId(e.target.value)} className="w-full px-3 py-2 text-sm" style={inputStyle}>
            <option value="">Default theme</option>
            {themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        {error ? <p className="text-sm" style={{ color: "#d9534f" }}>{error}</p> : null}
        <div className="flex gap-2">
          <PrimaryButton onClick={submit} disabled={pending}>
            {pending ? "Creating..." : "Create site"}
          </PrimaryButton>
          <Link href="/app/sites" className="inline-flex items-center px-3 py-1.5 text-sm" style={{ color: "var(--kb-text-secondary)" }}>
            Cancel
          </Link>
        </div>
      </div>
    </Card>
  );
}

// ----------------------------------------------------------- Site dashboard bar

export function SiteActionsBar({ siteId, slug, published }: { siteId: string; slug: string; published: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function togglePublish() {
    start(async () => {
      await setSitePublishedAction(siteId, !published);
      router.refresh();
    });
  }

  function remove() {
    if (!confirm("Delete this site and all its pages? This cannot be undone.")) return;
    start(async () => {
      await deleteSiteAction(siteId);
      router.push("/app/sites");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <PrimaryButton onClick={togglePublish} disabled={pending}>
        {published ? "Unpublish" : "Publish"}
      </PrimaryButton>
      <a
        href={`/s/${slug}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center rounded px-3 py-1.5 text-sm font-medium"
        style={{ border: "1px solid var(--kb-border)", color: "var(--kb-text-primary)", borderRadius: "var(--kb-radius-sm)" }}
      >
        View site
      </a>
      <GhostButton onClick={remove} danger>
        Delete
      </GhostButton>
    </div>
  );
}

// ----------------------------------------------------------- Pages manager

type PageRow = { id: string; slug: string; title: string; published: boolean; order: number; blockCount: number; isHome: boolean };

export function PagesManager({ siteId, initialPages }: { siteId: string; initialPages: PageRow[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [pending, start] = useTransition();

  function addPage() {
    if (!title.trim()) return;
    start(async () => {
      await createPageAction(siteId, { title });
      setTitle("");
      router.refresh();
    });
  }

  function togglePublish(p: PageRow) {
    start(async () => {
      await publishPageAction(siteId, p.id, !p.published);
      router.refresh();
    });
  }

  function makeHome(p: PageRow) {
    start(async () => {
      await setHomePageAction(siteId, p.id);
      router.refresh();
    });
  }

  function remove(p: PageRow) {
    if (!confirm(`Delete page "${p.title}"?`)) return;
    start(async () => {
      await deletePageAction(siteId, p.id);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card className="flex items-end gap-2 p-4">
        <div className="flex-1">
          <Field label="New page title">
            <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="About" onKeyDown={(e) => e.key === "Enter" && addPage()} />
          </Field>
        </div>
        <PrimaryButton onClick={addPage} disabled={pending}>
          Add page
        </PrimaryButton>
      </Card>

      <Card>
        {initialPages.length === 0 ? (
          <EmptyState message="No pages yet." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--kb-border)" }}>
                <Th>Title</Th>
                <Th>Slug</Th>
                <Th>Blocks</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {initialPages.map((p) => (
                <tr key={p.id} style={{ borderBottom: "1px solid var(--kb-border)" }}>
                  <Td>
                    <RowLink href={`/app/sites/${siteId}/pages/${p.id}`}>{p.title}</RowLink>
                    {p.isHome ? <span className="ml-2 text-[11px]" style={{ color: "var(--kb-text-secondary)" }}>(home)</span> : null}
                  </Td>
                  <Td>
                    <code className="text-xs">/{p.slug}</code>
                  </Td>
                  <Td>{p.blockCount}</Td>
                  <Td>
                    <StatusBadge published={p.published} />
                  </Td>
                  <Td>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => togglePublish(p)} className="text-xs hover:underline" style={{ color: "var(--kb-primary)" }}>
                        {p.published ? "Unpublish" : "Publish"}
                      </button>
                      {!p.isHome ? (
                        <button type="button" onClick={() => makeHome(p)} className="text-xs hover:underline" style={{ color: "var(--kb-primary)" }}>
                          Set home
                        </button>
                      ) : null}
                      <button type="button" onClick={() => remove(p)} className="text-xs hover:underline" style={{ color: "#d9534f" }}>
                        Delete
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ----------------------------------------------------------- Page editor

type EditorBlock = { id: string; type: string; order: number; visible: boolean; data: unknown };
type EditorPage = {
  id: string;
  title: string;
  slug: string;
  published: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageUrl: string | null;
  blocks: EditorBlock[];
};

export function PageEditor({ siteId, page }: { siteId: string; page: EditorPage }) {
  const router = useRouter();
  const [blocks, setBlocks] = useState<EditorBlock[]>(page.blocks);
  const [selectedId, setSelectedId] = useState<string | null>(page.blocks[0]?.id ?? null);
  const [pending, start] = useTransition();

  const selected = blocks.find((b) => b.id === selectedId) ?? null;

  function addBlock(type: SiteBlockTypeName) {
    start(async () => {
      const id = await createBlockAction(siteId, page.id, type);
      const data = defaultBlockData(type);
      setBlocks((prev) => [...prev, { id, type, order: prev.length, visible: true, data }]);
      setSelectedId(id);
      router.refresh();
    });
  }

  function saveBlock(blockId: string, data: BlockData, visible: boolean) {
    setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, data, visible } : b)));
    start(async () => {
      await updateBlockAction(siteId, page.id, blockId, { data, visible });
      router.refresh();
    });
  }

  function removeBlock(blockId: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
    if (selectedId === blockId) setSelectedId(null);
    start(async () => {
      await deleteBlockAction(siteId, page.id, blockId);
      router.refresh();
    });
  }

  function move(blockId: string, dir: -1 | 1) {
    const idx = blocks.findIndex((b) => b.id === blockId);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= blocks.length) return;
    const reordered = [...blocks];
    const [item] = reordered.splice(idx, 1);
    reordered.splice(next, 0, item!);
    setBlocks(reordered);
    start(async () => {
      await reorderBlocksAction(siteId, page.id, reordered.map((b) => b.id));
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr_320px]">
      {/* Palette */}
      <Card className="p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--kb-text-secondary)" }}>
          Add block
        </p>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
          {SITE_BLOCK_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => addBlock(t)}
              disabled={pending}
              title={BLOCK_DESCRIPTIONS[t]}
              className="rounded px-2 py-1.5 text-left text-xs font-medium disabled:opacity-60"
              style={{ border: "1px solid var(--kb-border)", color: "var(--kb-text-primary)", borderRadius: "var(--kb-radius-sm)" }}
            >
              {BLOCK_LABELS[t]}
            </button>
          ))}
        </div>
      </Card>

      {/* Block list */}
      <Card className="p-3">
        {blocks.length === 0 ? (
          <EmptyState message="No blocks yet. Add one from the palette." />
        ) : (
          <ul className="space-y-2">
            {blocks.map((b, i) => (
              <li
                key={b.id}
                onClick={() => setSelectedId(b.id)}
                className="cursor-pointer rounded p-3"
                style={{
                  border: `1px solid ${selectedId === b.id ? "var(--kb-primary)" : "var(--kb-border)"}`,
                  borderRadius: "var(--kb-radius-sm)",
                  opacity: b.visible ? 1 : 0.5,
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>
                    {BLOCK_LABELS[b.type as SiteBlockTypeName] ?? b.type}
                  </span>
                  <div className="flex items-center gap-2 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
                    <button type="button" onClick={(e) => { e.stopPropagation(); move(b.id, -1); }} disabled={i === 0} className="disabled:opacity-30">
                      Up
                    </button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); move(b.id, 1); }} disabled={i === blocks.length - 1} className="disabled:opacity-30">
                      Down
                    </button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); removeBlock(b.id); }} style={{ color: "#d9534f" }}>
                      Remove
                    </button>
                  </div>
                </div>
                <BlockPreview type={b.type} data={b.data as BlockData} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Settings: selected block + page SEO */}
      <div className="space-y-4">
        {selected ? (
          <BlockSettings key={selected.id} block={selected} onSave={saveBlock} />
        ) : (
          <Card className="p-4">
            <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>
              Select a block to edit its content.
            </p>
          </Card>
        )}
        <PageSeoSettings siteId={siteId} page={page} />
      </div>
    </div>
  );
}

function BlockPreview({ type, data }: { type: string; data: BlockData }) {
  const text =
    data.title ?? data.body ?? data.quote ?? data.html ?? data.url ?? data.caption ?? BLOCK_DESCRIPTIONS[type as SiteBlockTypeName] ?? "";
  return (
    <p className="mt-1 truncate text-xs" style={{ color: "var(--kb-text-secondary)" }}>
      {String(text).slice(0, 80)}
    </p>
  );
}

function BlockSettings({ block, onSave }: { block: EditorBlock; onSave: (id: string, data: BlockData, visible: boolean) => void }) {
  const [data, setData] = useState<BlockData>(block.data as BlockData);
  const [visible, setVisible] = useState(block.visible);

  function set<K extends keyof BlockData>(key: K, value: BlockData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  const type = block.type as SiteBlockTypeName;

  return (
    <Card className="p-4">
      <p className="mb-3 text-sm font-semibold" style={{ color: "var(--kb-text-primary)" }}>
        {BLOCK_LABELS[type] ?? type} settings
      </p>
      <div className="space-y-3">
        {(type === "HERO" || type === "CTA" || type === "FEATURES" || type === "FAQ" || type === "FORM_EMBED") && (
          <Field label="Title">
            <TextInput value={data.title ?? ""} onChange={(e) => set("title", e.target.value)} />
          </Field>
        )}
        {(type === "HERO" || type === "CTA") && (
          <>
            <Field label="Subtitle">
              <TextInput value={data.subtitle ?? ""} onChange={(e) => set("subtitle", e.target.value)} />
            </Field>
            <Field label="Button label">
              <TextInput value={data.buttonLabel ?? ""} onChange={(e) => set("buttonLabel", e.target.value)} />
            </Field>
            <Field label="Button link">
              <TextInput value={data.buttonHref ?? ""} onChange={(e) => set("buttonHref", e.target.value)} />
            </Field>
          </>
        )}
        {type === "TEXT" && (
          <Field label="Body">
            <TextArea rows={5} value={data.body ?? ""} onChange={(e) => set("body", e.target.value)} />
          </Field>
        )}
        {type === "HTML" && (
          <Field label="HTML">
            <TextArea rows={6} value={data.html ?? ""} onChange={(e) => set("html", e.target.value)} />
          </Field>
        )}
        {(type === "IMAGE" || type === "VIDEO") && (
          <>
            <Field label="URL">
              <TextInput value={data.url ?? ""} onChange={(e) => set("url", e.target.value)} />
            </Field>
            <Field label="Caption">
              <TextInput value={data.caption ?? ""} onChange={(e) => set("caption", e.target.value)} />
            </Field>
          </>
        )}
        {type === "TESTIMONIAL" && (
          <>
            <Field label="Quote">
              <TextArea rows={3} value={data.quote ?? ""} onChange={(e) => set("quote", e.target.value)} />
            </Field>
            <Field label="Author">
              <TextInput value={data.author ?? ""} onChange={(e) => set("author", e.target.value)} />
            </Field>
            <Field label="Role">
              <TextInput value={data.role ?? ""} onChange={(e) => set("role", e.target.value)} />
            </Field>
          </>
        )}
        {type === "FORM_EMBED" && (
          <Field label="Form slug">
            <TextInput value={data.formSlug ?? ""} onChange={(e) => set("formSlug", e.target.value)} placeholder="contact" />
          </Field>
        )}
        {type === "SPACER" && (
          <Field label="Height (px)">
            <TextInput type="number" value={String(data.height ?? 48)} onChange={(e) => set("height", Number(e.target.value) || 0)} />
          </Field>
        )}
        {(type === "FEATURES" || type === "FAQ" || type === "GALLERY") && (
          <p className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>
            Items for this block use the seeded defaults; rich item editing is a follow-up.
          </p>
        )}

        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--kb-text-primary)" }}>
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
          Visible
        </label>

        <PrimaryButton onClick={() => onSave(block.id, data, visible)}>Save block</PrimaryButton>
      </div>
    </Card>
  );
}

function PageSeoSettings({ siteId, page }: { siteId: string; page: EditorPage }) {
  const router = useRouter();
  const [title, setTitle] = useState(page.title);
  const [slug, setSlug] = useState(page.slug);
  const [seoTitle, setSeoTitle] = useState(page.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(page.seoDescription ?? "");
  const [ogImageUrl, setOgImageUrl] = useState(page.ogImageUrl ?? "");
  const [published, setPublished] = useState(page.published);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const { updatePageAction } = await import("./actions");
      await updatePageAction(siteId, page.id, {
        title,
        slug,
        seoTitle: seoTitle || null,
        seoDescription: seoDescription || null,
        ogImageUrl: ogImageUrl || null,
      });
      if (published !== page.published) {
        await publishPageAction(siteId, page.id, published);
      }
      router.refresh();
    });
  }

  return (
    <Card className="p-4">
      <p className="mb-3 text-sm font-semibold" style={{ color: "var(--kb-text-primary)" }}>
        Page settings
      </p>
      <div className="space-y-3">
        <Field label="Title">
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Slug">
          <TextInput value={slug} onChange={(e) => setSlug(e.target.value)} />
        </Field>
        <Field label="SEO title">
          <TextInput value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} />
        </Field>
        <Field label="SEO description">
          <TextArea rows={2} value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} />
        </Field>
        <Field label="OG image URL">
          <TextInput value={ogImageUrl} onChange={(e) => setOgImageUrl(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--kb-text-primary)" }}>
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
          Published
        </label>
        <PrimaryButton onClick={save} disabled={pending}>
          Save page
        </PrimaryButton>
      </div>
    </Card>
  );
}

// ----------------------------------------------------------- Domains manager

type DomainRow = { id: string; domain: string; verified: boolean; verificationToken: string };

export function DomainsManager({ siteId, customDomain, initialDomains }: { siteId: string; customDomain: string | null; initialDomains: DomainRow[] }) {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function add() {
    setError(null);
    if (!domain.trim()) return;
    start(async () => {
      try {
        await addDomainAction(siteId, domain.trim().toLowerCase());
        setDomain("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not add domain.");
      }
    });
  }

  function remove(id: string) {
    start(async () => {
      await deleteDomainAction(siteId, id);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {customDomain ? (
        <Card className="p-4">
          <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>
            Primary custom domain: <code>{customDomain}</code>
          </p>
        </Card>
      ) : null}
      <Card className="flex items-end gap-2 p-4">
        <div className="flex-1">
          <Field label="Add a domain">
            <TextInput value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="www.example.com" />
          </Field>
        </div>
        <PrimaryButton onClick={add} disabled={pending}>
          Add
        </PrimaryButton>
      </Card>
      {error ? <p className="text-sm" style={{ color: "#d9534f" }}>{error}</p> : null}
      <Card>
        {initialDomains.length === 0 ? (
          <EmptyState message="No custom domains yet." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--kb-border)" }}>
                <Th>Domain</Th>
                <Th>Status</Th>
                <Th>Verification (TXT)</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {initialDomains.map((d) => (
                <tr key={d.id} style={{ borderBottom: "1px solid var(--kb-border)" }}>
                  <Td>{d.domain}</Td>
                  <Td>
                    <span className="text-xs" style={{ color: d.verified ? "#5cb85c" : "#f0ad4e" }}>
                      {d.verified ? "Verified" : "Pending"}
                    </span>
                  </Td>
                  <Td>
                    <code className="text-[11px]">{d.verificationToken}</code>
                  </Td>
                  <Td>
                    <button type="button" onClick={() => remove(d.id)} className="text-xs hover:underline" style={{ color: "#d9534f" }}>
                      Remove
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ----------------------------------------------------------- Theme editor

export function ThemeEditor({ siteId, site }: { siteId: string; site: { theme: unknown; name: string } }) {
  const router = useRouter();
  const [tokens, setTokens] = useState<ThemeTokens>(resolveThemeTokens(site.theme));
  const [pending, start] = useTransition();

  function setColor(key: keyof ThemeTokens["colors"], value: string) {
    setTokens((prev) => ({ ...prev, colors: { ...prev.colors, [key]: value } }));
  }

  function save() {
    start(async () => {
      await updateSiteAction(siteId, { theme: tokens });
      router.refresh();
    });
  }

  function reset() {
    setTokens(DEFAULT_THEME_TOKENS);
  }

  const colorKeys: (keyof ThemeTokens["colors"])[] = ["primary", "background", "foreground", "muted", "accent"];

  return (
    <Card className="max-w-lg p-6">
      <div className="space-y-4">
        {colorKeys.map((k) => (
          <div key={k} className="flex items-center justify-between gap-4">
            <span className="text-sm capitalize" style={{ color: "var(--kb-text-primary)" }}>
              {k}
            </span>
            <div className="flex items-center gap-2">
              <input type="color" value={tokens.colors[k]} onChange={(e) => setColor(k, e.target.value)} className="h-8 w-10" />
              <TextInput value={tokens.colors[k]} onChange={(e) => setColor(k, e.target.value)} style={{ width: 120 }} />
            </div>
          </div>
        ))}
        <Field label="Section spacing">
          <TextInput value={tokens.spacing.section} onChange={(e) => setTokens((p) => ({ ...p, spacing: { section: e.target.value } }))} />
        </Field>
        <Field label="Base radius">
          <TextInput value={tokens.radii.base} onChange={(e) => setTokens((p) => ({ ...p, radii: { base: e.target.value } }))} />
        </Field>
        <div className="flex gap-2">
          <PrimaryButton onClick={save} disabled={pending}>
            Save theme
          </PrimaryButton>
          <GhostButton onClick={reset}>Reset to default</GhostButton>
        </div>
      </div>
    </Card>
  );
}

// ----------------------------------------------------------- Shared cells

export function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-4 py-2 text-left text-xs font-medium" style={{ color: "var(--kb-text-secondary)" }}>
      {children}
    </th>
  );
}

export function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-4 py-3" style={{ color: "var(--kb-text-primary)" }}>
      {children}
    </td>
  );
}
