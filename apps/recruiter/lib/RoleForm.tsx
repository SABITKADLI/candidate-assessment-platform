'use client';

import { useState } from 'react';
import { Button, Input } from '@cap/ui';

// ---- stage metadata --------------------------------------------------------

const STAGE_A_META = [
  { key: 'A_RESUME',      label: 'Resume Review',          sub: 'Parses and scores the uploaded CV' },
  { key: 'A_ID_LIVENESS', label: 'ID & Liveness',          sub: 'Verifies identity with a selfie' },
  { key: 'A_GMA',         label: 'General Mental Ability',  sub: '25-item timed cognitive test' },
  { key: 'A_BIG5',        label: 'Big Five Personality',    sub: '50-item OCEAN personality survey' },
  { key: 'A_MBTI',        label: 'MBTI Type',               sub: '16-type personality indicator' },
  { key: 'A_RORSCHACH',   label: 'Rorschach Test',          sub: '10 ambiguous inkblot projections' },
  { key: 'A_INTEGRITY',   label: 'Integrity Test',          sub: 'Overt integrity scale (30 items)' },
  { key: 'A_SJT',         label: 'Situational Judgement',   sub: 'Work-scenario judgement (16 items)' },
] as const;

const STAGE_B_META = [
  { key: 'B_CODING',      label: 'Coding Challenge',        sub: 'Live code execution with test runner' },
  { key: 'B_DEBUG',       label: 'Debugging Challenge',     sub: 'Find and fix bugs in provided code' },
  { key: 'B_WORK_SAMPLE', label: 'Work Sample',             sub: 'Open-ended design / writing task' },
  { key: 'B_ASYNC_VIDEO', label: 'Async Video Response',    sub: 'Record a spoken answer to a prompt' },
  { key: 'B_VERBAL',      label: 'Verbal Reasoning',        sub: 'Timed spoken verbal reasoning task' },
] as const;

// ---- weight buckets --------------------------------------------------------

const WEIGHT_BUCKETS = [
  { key: 'gma',        label: 'General Mental Ability' },
  { key: 'coding',     label: 'Coding' },
  { key: 'work_sample',label: 'Work Sample' },
  { key: 'verbal',     label: 'Verbal' },
  { key: 'sjt',        label: 'Situational Judgement' },
  { key: 'big5_mbti',  label: 'Big Five / MBTI' },
  { key: 'integrity',  label: 'Integrity' },
  { key: 'rorschach',  label: 'Rorschach' },
  { key: 'resume',     label: 'Resume' },
  { key: 'id_liveness',label: 'ID Liveness' },
] as const;

type WeightKey = typeof WEIGHT_BUCKETS[number]['key'];

// ---- presets ---------------------------------------------------------------

type Preset = {
  label: string;
  stagesA: string[];
  stagesB: string[];
  weights: Record<WeightKey, number>;
};

const PRESETS: Preset[] = [
  {
    label: 'Developer',
    stagesA: ['A_RESUME','A_GMA','A_BIG5','A_INTEGRITY'],
    stagesB: ['B_CODING','B_DEBUG','B_WORK_SAMPLE'],
    weights: { gma:20, coding:30, work_sample:20, verbal:5, sjt:5, big5_mbti:10, integrity:5, rorschach:0, resume:5, id_liveness:0 },
  },
  {
    label: 'Product Manager',
    stagesA: ['A_RESUME','A_GMA','A_BIG5','A_SJT','A_INTEGRITY'],
    stagesB: ['B_WORK_SAMPLE','B_ASYNC_VIDEO','B_VERBAL'],
    weights: { gma:20, coding:0, work_sample:25, verbal:20, sjt:15, big5_mbti:10, integrity:5, rorschach:0, resume:5, id_liveness:0 },
  },
  {
    label: 'Data Scientist',
    stagesA: ['A_RESUME','A_GMA','A_BIG5','A_INTEGRITY'],
    stagesB: ['B_CODING','B_WORK_SAMPLE'],
    weights: { gma:25, coding:30, work_sample:20, verbal:5, sjt:5, big5_mbti:5, integrity:5, rorschach:0, resume:5, id_liveness:0 },
  },
  {
    label: 'Designer',
    stagesA: ['A_RESUME','A_GMA','A_BIG5','A_SJT'],
    stagesB: ['B_WORK_SAMPLE','B_ASYNC_VIDEO','B_VERBAL'],
    weights: { gma:15, coding:0, work_sample:35, verbal:20, sjt:10, big5_mbti:10, integrity:5, rorschach:0, resume:5, id_liveness:0 },
  },
  {
    label: 'General Manager',
    stagesA: ['A_RESUME','A_GMA','A_BIG5','A_MBTI','A_RORSCHACH','A_INTEGRITY','A_SJT'],
    stagesB: ['B_WORK_SAMPLE','B_ASYNC_VIDEO','B_VERBAL'],
    weights: { gma:20, coding:0, work_sample:20, verbal:20, sjt:20, big5_mbti:10, integrity:5, rorschach:2, resume:3, id_liveness:0 },
  },
];

const ALL_STAGE_A = STAGE_A_META.map((s) => s.key);
const ALL_STAGE_B = STAGE_B_META.map((s) => s.key);
const DEFAULT_WEIGHTS: Record<WeightKey, number> = {
  gma:20, coding:20, work_sample:20, verbal:15, sjt:10,
  big5_mbti:8, integrity:5, rorschach:2, resume:0, id_liveness:0,
};

// ---- props -----------------------------------------------------------------

export type RoleInitial = {
  id?: string;
  name?: string;
  description?: string;
  stages_a?: string[] | null;
  stages_b?: string[] | null;
  stage_weights?: Record<string, number> | null;
};

export function RoleForm({ initial = {} }: { initial?: RoleInitial }) {
  const isEdit = !!initial.id;

  const [name, setName]               = useState(initial.name ?? '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [stagesA, setStagesA]         = useState<Set<string>>(new Set(initial.stages_a ?? ALL_STAGE_A));
  const [stagesB, setStagesB]         = useState<Set<string>>(new Set(initial.stages_b ?? ALL_STAGE_B));
  const [weights, setWeights]         = useState<Record<WeightKey, number>>(
    mergeWeights(initial.stage_weights),
  );
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  function applyPreset(p: Preset) {
    setStagesA(new Set(p.stagesA));
    setStagesB(new Set(p.stagesB));
    setWeights({ ...p.weights });
  }

  function toggleStage(group: 'A' | 'B', key: string) {
    if (group === 'A') {
      setStagesA((prev) => {
        const next = new Set(prev);
        next.has(key) ? next.delete(key) : next.add(key);
        return next;
      });
    } else {
      setStagesB((prev) => {
        const next = new Set(prev);
        next.has(key) ? next.delete(key) : next.add(key);
        return next;
      });
    }
  }

  function setWeight(key: WeightKey, raw: string) {
    const n = Math.max(0, Math.min(100, parseInt(raw, 10) || 0));
    setWeights((prev) => ({ ...prev, [key]: n }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const body = {
      name: name.trim(),
      description: description.trim() || undefined,
      stages_a: [...stagesA],
      stages_b: [...stagesB],
      stage_weights: Object.fromEntries(
        Object.entries(weights).filter(([, v]) => v > 0)
      ),
    };

    const url  = isEdit ? `/api/roles/${initial.id}` : '/api/roles';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({})) as { error?: string };
      setError(j.error ?? `HTTP ${res.status}`);
      setSaving(false);
      return;
    }

    window.location.href = '/roles';
  }

  return (
    <form onSubmit={(e) => { void submit(e); }} style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* ---- Presets ---- */}
      <div>
        <SectionLabel>Quick presets</SectionLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p)}
              style={{
                padding: '5px 12px',
                border: '1px solid var(--cap-border)',
                borderRadius: 'var(--cap-radius-md)',
                background: 'var(--cap-surface)',
                color: 'var(--cap-fg-2)',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--cap-fg-3)' }}>
          Selecting a preset will overwrite stage selections and weights below.
        </p>
      </div>

      {/* ---- Name & description ---- */}
      <Input
        label="Role name"
        type="text"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Senior Backend Engineer"
        maxLength={120}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label style={LABEL_STYLE}>
          Description <span style={{ color: 'var(--cap-fg-3)', fontWeight: 400 }}>(optional)</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what this role is assessing for…"
          maxLength={1000}
          rows={2}
          style={{
            background: 'var(--cap-surface)',
            border: '1px solid var(--cap-border)',
            borderRadius: 'var(--cap-radius-md)',
            padding: '8px 10px',
            color: 'var(--cap-fg-1)',
            fontSize: 13,
            fontFamily: 'var(--cap-font-sans)',
            resize: 'vertical',
            lineHeight: 1.5,
          }}
        />
      </div>

      {/* ---- Stage A ---- */}
      <StageGroup
        title="Stage A — Screening"
        sub="Psychometric and cognitive assessments"
        stages={STAGE_A_META as unknown as StageMeta[]}
        selected={stagesA}
        onToggle={(k) => toggleStage('A', k)}
        onSelectAll={() => setStagesA(new Set(ALL_STAGE_A))}
        onClearAll={() => setStagesA(new Set())}
      />

      {/* ---- Stage B ---- */}
      <StageGroup
        title="Stage B — Technical"
        sub="Practical skills and work-sample tasks"
        stages={STAGE_B_META as unknown as StageMeta[]}
        selected={stagesB}
        onToggle={(k) => toggleStage('B', k)}
        onSelectAll={() => setStagesB(new Set(ALL_STAGE_B))}
        onClearAll={() => setStagesB(new Set())}
      />

      {/* ---- Scoring weights ---- */}
      <div>
        <SectionLabel>Scoring weights</SectionLabel>
        <p style={{ margin: '4px 0 12px', fontSize: 11, color: 'var(--cap-fg-3)' }}>
          Relative importance per bucket (0–100). Weights are normalised — they don&apos;t need to sum to 100.
          Set a bucket to 0 to exclude it entirely from the composite score.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px 16px' }}>
          {WEIGHT_BUCKETS.map((b) => (
            <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{
                flex: 1, fontSize: 12, color: 'var(--cap-fg-2)', fontWeight: 500, cursor: 'default',
              }} htmlFor={`w-${b.key}`}>
                {b.label}
              </label>
              <input
                id={`w-${b.key}`}
                type="number"
                min={0}
                max={100}
                value={weights[b.key]}
                onChange={(e) => setWeight(b.key, e.target.value)}
                style={{
                  width: 60,
                  textAlign: 'right',
                  padding: '4px 8px',
                  background: 'var(--cap-surface)',
                  border: '1px solid var(--cap-border)',
                  borderRadius: 'var(--cap-radius-sm)',
                  color: 'var(--cap-fg-1)',
                  fontSize: 13,
                  fontFamily: 'var(--cap-font-mono)',
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {error && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--cap-danger)' }}>{error}</p>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <a href="/roles" style={{ textDecoration: 'none' }}>
          <Button variant="secondary" type="button">Cancel</Button>
        </a>
        <Button variant="primary" type="submit" disabled={saving}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create role'}
        </Button>
      </div>
    </form>
  );
}

// ---- helpers ---------------------------------------------------------------

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: 'var(--cap-fg-2)',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ ...LABEL_STYLE, display: 'block' }}>{children}</span>
  );
}

type StageMeta = { key: string; label: string; sub: string };

function StageGroup({
  title, sub, stages, selected, onToggle, onSelectAll, onClearAll,
}: {
  title: string; sub: string;
  stages: StageMeta[];
  selected: Set<string>;
  onToggle: (k: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div>
          <SectionLabel>{title}</SectionLabel>
          <span style={{ fontSize: 11, color: 'var(--cap-fg-3)' }}>{sub}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button type="button" onClick={onSelectAll} style={MINI_BTN}>All</button>
          <button type="button" onClick={onClearAll}  style={MINI_BTN}>None</button>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {stages.map((s) => {
          const active = selected.has(s.key);
          return (
            <label
              key={s.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                borderRadius: 'var(--cap-radius-md)',
                border: `1px solid ${active ? 'var(--cap-accent)' : 'var(--cap-border)'}`,
                background: active ? 'var(--cap-accent-surface)' : 'var(--cap-surface)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={active}
                onChange={() => onToggle(s.key)}
                style={{ accentColor: 'var(--cap-accent)', width: 14, height: 14, flexShrink: 0 }}
              />
              <div>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--cap-fg-1)' }}>{s.label}</span>
                <span style={{ fontSize: 11, color: 'var(--cap-fg-3)', marginLeft: 6 }}>{s.sub}</span>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

const MINI_BTN: React.CSSProperties = {
  padding: '3px 8px',
  border: '1px solid var(--cap-border)',
  borderRadius: 'var(--cap-radius-sm)',
  background: 'transparent',
  color: 'var(--cap-fg-3)',
  fontSize: 11,
  cursor: 'pointer',
};

function mergeWeights(raw: Record<string, number> | null | undefined): Record<WeightKey, number> {
  const base = { ...DEFAULT_WEIGHTS };
  if (!raw) return base;
  for (const k of WEIGHT_BUCKETS.map((b) => b.key)) {
    if (typeof raw[k] === 'number') base[k] = raw[k];
  }
  return base;
}
