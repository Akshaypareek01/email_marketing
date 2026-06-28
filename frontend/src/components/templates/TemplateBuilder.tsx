'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import DOMPurify from 'isomorphic-dompurify';
import { Button, Card, CardBody, Input, Select } from '@/components/ui';
import {
  BLOCK_META,
  type Align,
  type BlockType,
  type TemplateBlock,
  type TemplateDesign,
  blocksToHtml,
  createBlock,
  designFromHtml,
  FONT_OPTIONS,
  parseDesign,
  serializeDesign,
} from '@/lib/templateBlocks';

interface TemplateBuilderProps {
  initialName?: string;
  initialSubject?: string;
  initialHtml?: string;
  saving?: boolean;
  error?: string;
  submitLabel?: string;
  readOnly?: boolean;
  onSubmit: (data: { name: string; subject: string; htmlBody: string }) => void;
  onCancel?: () => void;
}

const ADD_ORDER: BlockType[] = ['heading', 'text', 'image', 'button', 'logo', 'divider', 'spacer', 'html'];

const MERGE_TAGS = ['{{first_name}}', '{{last_name}}', '{{email}}', '{{company}}'];

/**
 * No-code email designer: add blocks, tweak colors, drop in a logo or images,
 * and watch a live preview update — no HTML knowledge required. Power users can
 * still flip to "Code" to edit raw HTML.
 */
export function TemplateBuilder({
  initialName = '',
  initialSubject = '',
  initialHtml = '',
  saving = false,
  error = '',
  submitLabel = 'Save template',
  readOnly = false,
  onSubmit,
  onCancel,
}: TemplateBuilderProps) {
  const parsed = useMemo(() => parseDesign(initialHtml), [initialHtml]);
  // Templates with embedded design open visually; raw HTML (legacy/imported) opens in code mode.
  const hasRawHtml = !parsed && initialHtml.trim().length > 0;

  const [name, setName] = useState(initialName);
  const [subject, setSubject] = useState(initialSubject);
  // Raw/imported HTML becomes an editable HTML block — never discarded.
  const [design, setDesign] = useState<TemplateDesign>(() => designFromHtml(initialHtml));
  const [codeMode, setCodeMode] = useState(hasRawHtml);
  const [rawHtml, setRawHtml] = useState(initialHtml);

  function goDesign() {
    // Carry whatever is in the code editor into Design so nothing is lost.
    if (codeMode) setDesign(designFromHtml(rawHtml));
    setCodeMode(false);
  }
  function goCode() {
    if (!codeMode) setRawHtml(serializeDesign(design));
    setCodeMode(true);
  }

  const previewHtml = codeMode ? rawHtml : blocksToHtml(design);

  function patchBlock(id: string, patch: Partial<TemplateBlock>) {
    setDesign((d) => ({
      ...d,
      blocks: d.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as TemplateBlock) : b)),
    }));
  }
  function addBlock(type: BlockType) {
    setDesign((d) => ({ ...d, blocks: [...d.blocks, createBlock(type)] }));
  }
  function removeBlock(id: string) {
    setDesign((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== id) }));
  }
  function moveBlock(id: string, dir: -1 | 1) {
    setDesign((d) => {
      const idx = d.blocks.findIndex((b) => b.id === id);
      const next = idx + dir;
      if (idx < 0 || next < 0 || next >= d.blocks.length) return d;
      const blocks = [...d.blocks];
      [blocks[idx], blocks[next]] = [blocks[next], blocks[idx]];
      return { ...d, blocks };
    });
  }

  function handleSubmit() {
    if (readOnly) return;
    const htmlBody = codeMode ? rawHtml : serializeDesign(design);
    onSubmit({ name, subject, htmlBody });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      {/* ----------------------------- Editor ----------------------------- */}
      <div className="space-y-4">
        <Card>
          <CardBody className="space-y-4">
            <Input label="Template name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Welcome email" required readOnly={readOnly} />
            <Input label="Email subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Welcome to {{company}} 🎉" readOnly={readOnly} />
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs font-medium text-foreground">Personalize with tags</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Type any of these and we’ll fill in each contact’s details:</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {MERGE_TAGS.map((t) => (
                  <code key={t} className="rounded bg-white px-1.5 py-0.5 text-[11px] text-[var(--primary)] ring-1 ring-border">{t}</code>
                ))}
              </div>
            </div>
          </CardBody>
        </Card>

        {!readOnly && (
          <div className="flex items-center justify-between">
            <div className="inline-flex rounded-lg border border-border bg-white p-0.5 text-sm">
              <button
                type="button"
                onClick={goDesign}
                className={`rounded-md px-3 py-1.5 font-medium transition ${!codeMode ? 'bg-[var(--primary)] text-white' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Design
              </button>
              <button
                type="button"
                onClick={goCode}
                className={`rounded-md px-3 py-1.5 font-medium transition ${codeMode ? 'bg-[var(--primary)] text-white' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Code
              </button>
            </div>
          </div>
        )}

        {codeMode ? (
          <Card>
            <CardBody className="space-y-2">
              {!readOnly && (
                <div className="flex items-start gap-2 rounded-lg border border-[var(--primary)]/20 bg-[var(--primary)]/5 p-3 text-xs">
                  <span aria-hidden>💡</span>
                  <p>
                    Prefer no code? Switch to{' '}
                    <button type="button" onClick={goDesign} className="font-semibold text-[var(--primary)] underline-offset-2 hover:underline">
                      Design
                    </button>{' '}
                    — your current template is kept as an editable block, and you can add a logo, images, buttons and text, aligning each one left, center or right.
                  </p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Advanced: edit the raw HTML. Include <code>{'{{unsubscribe_url}}'}</code> for marketing emails.</p>
              <textarea
                value={rawHtml}
                onChange={(e) => setRawHtml(e.target.value)}
                rows={18}
                readOnly={readOnly}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 font-mono text-xs outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/30"
              />
            </CardBody>
          </Card>
        ) : (
          <>
            {/* Global style settings */}
            <Card>
              <CardBody className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <ColorField label="Background" value={design.bg} onChange={(v) => setDesign((d) => ({ ...d, bg: v }))} disabled={readOnly} />
                <ColorField label="Card" value={design.card} onChange={(v) => setDesign((d) => ({ ...d, card: v }))} disabled={readOnly} />
                <div className="col-span-2">
                  <Select label="Font" value={design.font} onChange={(e) => setDesign((d) => ({ ...d, font: e.target.value }))} disabled={readOnly}>
                    {FONT_OPTIONS.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </Select>
                </div>
                <label className="col-span-2 mt-1 flex items-center gap-2 text-sm sm:col-span-4">
                  <input type="checkbox" checked={design.showUnsub} disabled={readOnly} onChange={(e) => setDesign((d) => ({ ...d, showUnsub: e.target.checked }))} />
                  Add an unsubscribe footer (required for marketing email)
                </label>
              </CardBody>
            </Card>

            {/* Block list */}
            <div className="space-y-3">
              {design.blocks.map((b, i) => (
                <BlockEditor
                  key={b.id}
                  block={b}
                  index={i}
                  total={design.blocks.length}
                  readOnly={readOnly}
                  onPatch={(patch) => patchBlock(b.id, patch)}
                  onRemove={() => removeBlock(b.id)}
                  onMove={(dir) => moveBlock(b.id, dir)}
                />
              ))}
            </div>

            {/* Add toolbar */}
            {!readOnly && (
              <Card>
                <CardBody>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Add a block</p>
                  <div className="flex flex-wrap gap-2">
                    {ADD_ORDER.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => addBlock(type)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium transition hover:border-[var(--primary)]/50 hover:bg-muted/40"
                      >
                        <span aria-hidden>{BLOCK_META[type].icon}</span>
                        {BLOCK_META[type].label}
                      </button>
                    ))}
                  </div>
                </CardBody>
              </Card>
            )}
          </>
        )}

        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        {!readOnly && (
          <div className="flex gap-2">
            <Button type="button" onClick={handleSubmit} loading={saving} disabled={!name.trim()}>{submitLabel}</Button>
            {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
          </div>
        )}
      </div>

      {/* ----------------------------- Preview ---------------------------- */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        <div className="mb-2 flex items-center gap-2">
          <p className="text-sm font-medium">Live preview</p>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">stays in view as you edit</span>
        </div>
        <div
          className="overflow-auto rounded-xl border border-border bg-white"
          style={{ maxHeight: 'calc(100vh - 2rem)' }}
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewHtml) }}
        />
      </div>
    </div>
  );
}

/* ----------------------------- Sub-editors ----------------------------- */

function BlockEditor({
  block,
  index,
  total,
  readOnly,
  onPatch,
  onRemove,
  onMove,
}: {
  block: TemplateBlock;
  index: number;
  total: number;
  readOnly: boolean;
  onPatch: (patch: Partial<TemplateBlock>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-white">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span aria-hidden>{BLOCK_META[block.type].icon}</span>
          {BLOCK_META[block.type].label}
        </span>
        {!readOnly && (
          <div className="flex items-center gap-0.5">
            <IconBtn label="Move up" disabled={index === 0} onClick={() => onMove(-1)}>↑</IconBtn>
            <IconBtn label="Move down" disabled={index === total - 1} onClick={() => onMove(1)}>↓</IconBtn>
            <IconBtn label="Delete block" onClick={onRemove}>✕</IconBtn>
          </div>
        )}
      </div>
      <div className="space-y-3 p-3">
        <BlockFields block={block} readOnly={readOnly} onPatch={onPatch} />
      </div>
    </div>
  );
}

function BlockFields({
  block,
  readOnly,
  onPatch,
}: {
  block: TemplateBlock;
  readOnly: boolean;
  onPatch: (patch: Partial<TemplateBlock>) => void;
}) {
  switch (block.type) {
    case 'heading':
    case 'text':
      return (
        <>
          <textarea
            value={block.text}
            readOnly={readOnly}
            onChange={(e) => onPatch({ text: e.target.value })}
            rows={block.type === 'heading' ? 2 : 4}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/30"
          />
          <div className="flex items-center gap-3">
            <AlignField value={block.align} onChange={(align) => onPatch({ align })} disabled={readOnly} />
            <ColorField label="Color" value={block.color} onChange={(color) => onPatch({ color })} disabled={readOnly} />
          </div>
        </>
      );
    case 'button':
      return (
        <>
          <Input label="Button label" value={block.text} readOnly={readOnly} onChange={(e) => onPatch({ text: e.target.value })} />
          <Input label="Link (URL)" value={block.href} readOnly={readOnly} onChange={(e) => onPatch({ href: e.target.value })} placeholder="https://example.com" />
          <div className="flex flex-wrap items-center gap-3">
            <AlignField value={block.align} onChange={(align) => onPatch({ align })} disabled={readOnly} />
            <ColorField label="Button" value={block.bg} onChange={(bg) => onPatch({ bg })} disabled={readOnly} />
            <ColorField label="Text" value={block.color} onChange={(color) => onPatch({ color })} disabled={readOnly} />
          </div>
        </>
      );
    case 'logo':
    case 'image':
      return (
        <>
          <ImageField
            value={block.src}
            onChange={(src) => onPatch({ src })}
            disabled={readOnly}
            label={block.type === 'logo' ? 'Logo image' : 'Image'}
          />
          {block.type === 'image' && (
            <Input label="Alt text (for accessibility)" value={block.alt} readOnly={readOnly} onChange={(e) => onPatch({ alt: e.target.value })} />
          )}
          <Input label="Links to (optional URL)" value={block.href} readOnly={readOnly} onChange={(e) => onPatch({ href: e.target.value })} placeholder="https://example.com" />
          <div className="flex flex-wrap items-center gap-4">
            <AlignField value={block.align} onChange={(align) => onPatch({ align })} disabled={readOnly} />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Width
              <input
                type="range"
                min={60}
                max={600}
                value={block.width}
                disabled={readOnly}
                onChange={(e) => onPatch({ width: Number(e.target.value) })}
              />
              <span className="w-10 text-right tabular-nums">{block.width}px</span>
            </label>
          </div>
        </>
      );
    case 'spacer':
      return (
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Height
          <input type="range" min={8} max={80} value={block.height} disabled={readOnly} onChange={(e) => onPatch({ height: Number(e.target.value) })} />
          <span className="w-10 text-right tabular-nums">{block.height}px</span>
        </label>
      );
    case 'divider':
      return <p className="text-xs text-muted-foreground">A simple horizontal line.</p>;
    case 'html':
      return (
        <>
          <p className="text-xs text-muted-foreground">Your template’s HTML. Edit here, or add visual blocks above/below it.</p>
          <textarea
            value={block.html}
            readOnly={readOnly}
            onChange={(e) => onPatch({ html: e.target.value })}
            rows={10}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 font-mono text-xs outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/30"
          />
        </>
      );
  }
}

function IconBtn({ children, label, onClick, disabled }: { children: ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid h-7 w-7 place-items-center rounded-md text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function AlignIcon({ align }: { align: Align }) {
  // Three lines whose widths/offsets read as left / center / right alignment.
  const rows =
    align === 'left'
      ? [[3, 10], [3, 16], [3, 8]]
      : align === 'right'
      ? [[11, 10], [5, 16], [13, 8]]
      : [[6, 12], [4, 16], [7, 10]];
  return (
    <svg viewBox="0 0 21 16" className="h-4 w-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      {rows.map(([x, w], i) => (
        <line key={i} x1={x} y1={3 + i * 5} x2={x + w} y2={3 + i * 5} />
      ))}
    </svg>
  );
}

function AlignField({ value, onChange, disabled }: { value: Align; onChange: (a: Align) => void; disabled?: boolean }) {
  const opts: Align[] = ['left', 'center', 'right'];
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">Align</span>
      <div className="inline-flex overflow-hidden rounded-lg border border-border">
        {opts.map((a) => (
          <button
            key={a}
            type="button"
            disabled={disabled}
            onClick={() => onChange(a)}
            aria-label={`Align ${a}`}
            aria-pressed={value === a}
            title={`Align ${a}`}
            className={`grid h-7 w-8 place-items-center transition ${value === a ? 'bg-[var(--primary)] text-white' : 'bg-white text-muted-foreground hover:bg-muted'}`}
          >
            <AlignIcon align={a} />
          </button>
        ))}
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
      {label}
      <input
        type="color"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-9 cursor-pointer rounded border border-border bg-white p-0.5 disabled:cursor-not-allowed"
      />
    </label>
  );
}

function ImageField({ value, onChange, disabled, label }: { value: string; onChange: (v: string) => void; disabled?: boolean; label: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'url' | 'upload'>('url');

  function onFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result || ''));
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {!disabled && (
          <div className="inline-flex rounded-md border border-border bg-white p-0.5 text-xs">
            <button type="button" onClick={() => setTab('url')} className={`rounded px-2 py-0.5 ${tab === 'url' ? 'bg-muted font-medium' : 'text-muted-foreground'}`}>Link</button>
            <button type="button" onClick={() => setTab('upload')} className={`rounded px-2 py-0.5 ${tab === 'upload' ? 'bg-muted font-medium' : 'text-muted-foreground'}`}>Upload</button>
          </div>
        )}
      </div>

      {tab === 'url' ? (
        <Input value={value.startsWith('data:') ? '' : value} readOnly={disabled} onChange={(e) => onChange(e.target.value)} placeholder="https://yoursite.com/logo.png" />
      ) : (
        <div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0] || null)} />
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={disabled}>Choose image…</Button>
          <p className="mt-1 text-[11px] text-muted-foreground">Tip: a hosted image link delivers best across email apps.</p>
        </div>
      )}

      {value && (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="h-10 w-10 rounded border border-border object-contain" />
          {!disabled && (
            <button type="button" onClick={() => onChange('')} className="text-xs text-muted-foreground hover:text-[var(--danger)]">Remove</button>
          )}
        </div>
      )}
    </div>
  );
}
