import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  Skeleton,
  SkeletonItem,
  Slider,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components';
import type { Assumptions, BuildingSpec, DraftField, ImportDraft, Orientation } from '@envelope/models';
import { INDIA_BOUNDS, insideIndia, specFromDraft, takeoff, toLocalEN, validateSpec } from '@envelope/models';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ACCEPT,
  EXPORT_GUIDES,
  FULL_IMPORT,
  MESH_IMPORT,
  cancelParse,
  parseModelFile,
} from '../import/client';
import { saveImportedModel } from '../import/persist';
import { useAppStore } from '../store/appStore';
import type { GeocodeResults } from '../viewer/controller';
import { viewerCommands } from '../viewer/controller';
import { EmptyState } from './EmptyState';
import { DragHandle } from './ResizeHandle';
import { Icon, IconButton } from './ui';

const useStyles = makeStyles({
  surface: { width: 'min(1440px, 96vw)', maxWidth: '96vw', height: '90vh', padding: 0, overflow: 'hidden' },
  // Full screen (button beside close): the whole window, square corners.
  full: { width: '100vw', maxWidth: '100vw', height: '100vh', maxHeight: '100vh', borderRadius: 0 },
  body: { height: '100%', display: 'flex', flexDirection: 'column', gap: 0, maxHeight: 'none' },
  // Form | drag edge | footprint preview; the form's share is set by dragging (50% to start).
  cols: { flexGrow: 1, minHeight: 0, display: 'grid' },
  head: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px 12px 24px',
    borderBottom: '1px solid var(--outline-variant)',
  },
  title: {
    flexGrow: 1,
    fontFamily: 'var(--font-brand)',
    fontSize: '22px',
    lineHeight: '28px',
    fontWeight: 400,
  },
  side: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    overflowY: 'auto',
    maxHeight: 'none',
    minWidth: 0,
    // Fluent inputs keep a native minimum width; let them shrink to their grid cell instead.
    '& .fui-Field': { minWidth: 0 },
    '& .fui-Input': { width: '100%', minWidth: 0, boxSizing: 'border-box' },
    '& .fui-Input__input': { minWidth: 0, width: '100%' },
    gridColumnStart: 1,
    gridColumnEnd: 2,
    gridRowStart: 1,
    gridRowEnd: 2,
  },
  stepHead: { display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', fontWeight: 500 },
  num: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    display: 'grid',
    placeItems: 'center',
    fontSize: '12px',
    backgroundColor: 'var(--surface-container-highest)',
    color: 'var(--on-surface-variant)',
    flexShrink: 0,
  },
  numOn: { backgroundColor: 'var(--primary)', color: 'var(--on-primary)' },
  numDone: { backgroundColor: 'var(--primary-container)', color: 'var(--on-primary-container)' },
  stepBody: {
    marginLeft: '11px',
    paddingLeft: '23px',
    paddingBottom: '4px',
    borderLeft: '1px solid var(--outline-variant)',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  drop: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    padding: '20px 16px',
    borderRadius: 'var(--radius-md)',
    border: '1px dashed var(--outline)',
    backgroundColor: 'var(--surface-container-low)',
    textAlign: 'center',
    fontSize: '13px',
    color: 'var(--on-surface-variant)',
    cursor: 'pointer',
  },
  dropOn: {
    borderTopColor: 'var(--primary)',
    borderRightColor: 'var(--primary)',
    borderBottomColor: 'var(--primary)',
    borderLeftColor: 'var(--primary)',
    backgroundColor: 'var(--primary-container)',
  },
  meta: { fontSize: '13px', lineHeight: '18px', color: 'var(--on-surface-variant)', margin: 0 },
  warn: {
    fontSize: '12px',
    lineHeight: '16px',
    padding: '6px 10px',
    borderRadius: 'var(--radius-xs)',
    backgroundColor: 'var(--warning-container)',
    color: 'var(--on-warning-container)',
  },
  err: {
    fontSize: '13px',
    padding: '8px 12px',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--error-container)',
    color: 'var(--on-error-container)',
  },
  guide: {
    fontSize: '13px',
    lineHeight: '18px',
    padding: '12px',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--tertiary-container)',
    color: 'var(--on-tertiary-container)',
  },
  // Paired fields sit side by side and wrap to one per line when the form gets narrow.
  row: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' },
  row4: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px' },
  // Rotation: slider on a grey track with typed degrees and quarter-turn buttons.
  rotate: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 8px 8px 16px',
    borderRadius: 'var(--radius-lg)',
    backgroundColor: 'var(--surface-container-highest)',
  },
  rotSlider: {
    flexGrow: 1,
    minWidth: '160px',
    '--fui-Slider__rail--color': 'var(--outline)',
    '--fui-Slider__progress--color': 'var(--primary)',
    '--fui-Slider__thumb--color': 'var(--primary)',
    '--fui-Slider__rail--size': '4px',
  },
  rotInput: { width: '104px', flexShrink: 0 },
  results: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' },
  result: {
    width: '100%',
    textAlign: 'left',
    border: 0,
    borderRadius: 'var(--radius-xs)',
    padding: '6px 8px',
    fontSize: '13px',
    backgroundColor: 'var(--surface-container)',
    color: 'var(--on-surface)',
    cursor: 'pointer',
  },
  actions: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  preview: {
    backgroundColor: 'var(--surface-container)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '24px',
    minHeight: 0,
    gridColumnStart: 3,
    gridColumnEnd: 4,
    gridRowStart: 1,
    gridRowEnd: 2,
  },
  svg: { width: '100%', maxWidth: '560px', flexGrow: 1, minHeight: 0 },
  facts: { fontSize: '13px', color: 'var(--on-surface-variant)', textAlign: 'center' },
  problems: { margin: 0, paddingLeft: '18px', fontSize: '13px', color: 'var(--error)' },
});

const USES: BuildingSpec['use'][] = ['office', 'residential', 'retail', 'mixed'];
const UNITS = [
  { label: 'metres', value: 1 },
  { label: 'centimetres', value: 0.01 },
  { label: 'millimetres', value: 0.001 },
  { label: 'feet', value: 0.3048 },
];
const ORIENTS: Orientation[] = ['N', 'E', 'S', 'W'];

type Phase = 'idle' | 'parsing' | 'ready' | 'error' | 'guide';

/** Fields that cannot be negative drop a typed minus sign. */
const nonNegative = (v: string) => v.replace(/-/g, '');
/** Degrees clockwise, 0–359. */
const wrapDeg = (v: number) => ((Math.round(v) % 360) + 360) % 360;

/** "28.4060, 77.0850" (as copied from Google Maps) → two numbers. */
function parsePair(text: string): [number, number] | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/**
 * Import a building model (import plan, D-027): 1 file → 2 review the values read from it →
 * 3 place it. Nothing in the app changes until "Place building" passes validateSpec.
 */
export function ImportDialog() {
  const s = useStyles();
  const open = useAppStore((st) => st.ui.importOpen);
  const setOpen = useAppStore((st) => st.setImportOpen);
  const source = useAppStore((st) => st.buildingSource);
  const current = useAppStore((st) => st.building);
  const fileRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>('idle');
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guide, setGuide] = useState<{ tool: string; steps: string; file: string } | null>(null);
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [glb, setGlb] = useState<Uint8Array | null>(null);

  const [name, setName] = useState('');
  const [use, setUse] = useState<BuildingSpec['use']>('office');
  const [floors, setFloors] = useState('');
  const [height, setHeight] = useState('');
  // True while the floor height is the model's height shared over the floors, not typed.
  const [heightAuto, setHeightAuto] = useState(false);
  const [unit, setUnit] = useState(1);
  const [wwr, setWwr] = useState<Partial<Record<Orientation, string>>>({});

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<GeocodeResults | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [label, setLabel] = useState('');
  const [rotation, setRotation] = useState(0);
  const [rotationText, setRotationText] = useState('0');
  useEffect(() => setRotationText(String(rotation)), [rotation]);
  // Form share of the dialog width (%), and full-screen mode.
  const [split, setSplit] = useState(50);
  const [full, setFull] = useState(false);
  const colsRef = useRef<HTMLDivElement>(null);
  const [buffer, setBuffer] = useState('15');

  useEffect(() => {
    if (!open) cancelParse();
  }, [open]);

  const reset = () => {
    setPhase('idle');
    setError(null);
    setGuide(null);
    setDraft(null);
    setGlb(null);
    setFound(null);
    setSearchError(null);
    setWwr({});
    setUnit(1);
    setHeightAuto(false);
    setRotation(0);
  };

  const onFile = async (file: File) => {
    reset();
    const ext = file.name.toLowerCase().split('.').pop() ?? '';
    const g = EXPORT_GUIDES[ext];
    if (g) {
      setGuide({ ...g, file: file.name });
      setPhase('guide');
      return;
    }
    if (![...FULL_IMPORT, ...MESH_IMPORT].includes(ext)) {
      setError(`".${ext}" files cannot be imported. Use IFC (.ifc), or a mesh (.glb, .gltf, .obj).`);
      setPhase('error');
      return;
    }
    setPhase('parsing');
    try {
      const r = await parseModelFile(file);
      const d = r.draft;
      setDraft(d);
      setGlb(r.glb);
      setName(d.name);
      setUse(d.use);
      setFloors(d.floors !== null ? String(d.floors) : '');
      setHeight(d.floorToFloorM !== null ? d.floorToFloorM.toFixed(2) : '');
      setHeightAuto(d.floorToFloorM === null && d.heightM !== undefined);
      if (d.ifcSite && insideIndia(d.ifcSite.lat, d.ifcSite.lon)) {
        setLat(d.ifcSite.lat.toFixed(6));
        setLon(d.ifcSite.lon.toFixed(6));
        setLabel(`${d.name} site (from the file)`);
      } else {
        setLat('');
        setLon('');
        setLabel('');
      }
      setPhase('ready');
    } catch (e) {
      setError((e as Error).message || 'The file could not be read.');
      setPhase('error');
    }
  };

  const search = async () => {
    if (query.trim().length < 3) return;
    setSearching(true);
    setSearchError(null);
    try {
      setFound(await viewerCommands.geocode(query.trim()));
    } catch (e) {
      setFound(null);
      setSearchError((e as Error).message);
    } finally {
      setSearching(false);
    }
  };

  const scaled = useMemo(
    () =>
      draft && unit !== 1
        ? { ...draft, hull: draft.hull.map(([x, y]) => [x * unit, y * unit] as [number, number]) }
        : draft,
    [draft, unit],
  );
  const latN = Number(lat);
  const lonN = Number(lon);
  const hasSite = lat.trim() !== '' && lon.trim() !== '' && Number.isFinite(latN) && Number.isFinite(lonN);
  const floorsN = Number(floors);
  const heightN = Number(height);
  // Mesh height above ground in metres; floors × floor-to-floor is checked against it.
  const modelHeightM = draft?.heightM !== undefined ? draft.heightM * unit : null;
  const fromModel = (n: number, u: number) =>
    draft?.heightM !== undefined && n > 0 ? ((draft.heightM * u) / n).toFixed(2) : '';
  const enteredM = floorsN * heightN;
  const heightMismatch =
    modelHeightM !== null &&
    modelHeightM > 0 &&
    floorsN > 0 &&
    heightN > 0 &&
    Math.abs(enteredM - modelHeightM) > 0.15 * modelHeightM;

  // Spec as it would be placed now; WWR typed per facade overrides the model's.
  const candidate = useMemo(() => {
    if (!scaled) return null;
    const overrides: Partial<Record<Orientation, number>> = {};
    for (const o of ORIENTS) if (wwr[o] !== undefined && wwr[o] !== '') overrides[o] = Number(wwr[o]);
    return specFromDraft(
      scaled,
      {
        lat: hasSite ? latN : 28.6,
        lon: hasSite ? lonN : 77.2,
        label: label.trim() || 'Imported site',
        rotationDeg: rotation,
        plotBufferM: Number(buffer),
      },
      {
        name: name.trim() || scaled.name,
        use,
        floors: Number.isFinite(floorsN) && floorsN > 0 ? floorsN : 1,
        floorToFloorM: Number.isFinite(heightN) && heightN > 0 ? heightN : 3,
        wwr: overrides,
      },
    );
  }, [scaled, hasSite, latN, lonN, label, rotation, buffer, name, use, floorsN, heightN, wwr]);

  const problems = useMemo(() => {
    if (!candidate) return [];
    const p: string[] = [];
    if (!hasSite) p.push('Choose the site: search for an address or type latitude and longitude.');
    else if (!insideIndia(latN, lonN))
      p.push(
        `The site is outside India (lat ${INDIA_BOUNDS.latMin}–${INDIA_BOUNDS.latMax}, lon ${INDIA_BOUNDS.lonMin}–${INDIA_BOUNDS.lonMax}). The models use IST and Indian limits, so imports are limited to India for now.`,
      );
    if (floors.trim() === '') p.push('Enter the number of floors.');
    if (height.trim() === '') p.push('Enter the floor-to-floor height.');
    for (const v of validateSpec(candidate)) if (!/India/.test(v) || hasSite) p.push(v);
    return [...new Set(p)].filter(
      (v, _i, all) => !(v.includes('must be in India') && all.some((x) => x.includes('outside India'))),
    );
  }, [candidate, hasSite, latN, lonN, floors, height]);

  const place = async () => {
    if (!candidate || !draft || problems.length) return;
    const assumptions: Partial<Assumptions> =
      draft.kind === 'ifc'
        ? draft.basements
          ? { basements: draft.basements.count, basementDepthM: Number(draft.basements.depthM.toFixed(2)) }
          : { basements: 0 }
        : { basements: 0 };
    const blob = glb ? new Blob([glb as BlobPart], { type: 'model/gltf-binary' }) : null;
    if (blob) await saveImportedModel(blob);
    useAppStore.getState().setBuilding(
      candidate,
      {
        kind: draft.kind,
        fileName: draft.fileName,
        modelHeadingDeg: draft.northRotationDeg + rotation,
        modelScale: unit,
        ...(modelHeightM !== null ? { modelHeightM: Number(modelHeightM.toFixed(2)) } : {}),
      },
      { modelUrl: blob ? URL.createObjectURL(blob) : null, assumptions },
    );
    setOpen(false);
    reset();
  };

  const warningsFor = (field: DraftField) =>
    (draft?.warnings ?? [])
      .filter((w) => w.field === field)
      .map((w) => (
        <div key={w.text} className={s.warn} data-testid={`import-warning-${field}`}>
          {w.text}
        </div>
      ));

  const step = phase === 'ready' ? (hasSite ? 3 : 2) : 1;
  const num = (n: number) => (
    <span className={mergeClasses(s.num, step === n && s.numOn, step > n && s.numDone)}>
      {step > n ? <Icon name="check" size={18} /> : n}
    </span>
  );
  const t = candidate ? takeoff(candidate) : null;
  const computedWwr = (o: Orientation) => (candidate ? candidate.wwr[o].toFixed(2) : '');

  return (
    <Dialog open={open} onOpenChange={(_, d) => setOpen(d.open)}>
      <DialogSurface className={mergeClasses(s.surface, full && s.full)} data-testid="dialog-import">
        <DialogBody className={s.body}>
          <div className={s.head}>
            <Icon name="upload_file" size={24} />
            <DialogTitle className={s.title}>Import building model</DialogTitle>
            <IconButton
              icon={full ? 'close_fullscreen' : 'open_in_full'}
              label={full ? 'Exit full screen' : 'Full screen'}
              testId="ctl-import-fullscreen"
              pressed={full}
              onClick={() => setFull((v) => !v)}
            />
            <IconButton icon="close" label="Close" testId="ctl-import-close" onClick={() => setOpen(false)} />
          </div>
          <div className={s.cols} ref={colsRef} style={{ gridTemplateColumns: `${split}% 12px 1fr` }}>
            <DialogContent className={mergeClasses(s.side, 'env-scroll')}>
              <div className={s.stepHead}>
                {num(1)}
                Model file
              </div>
              <div className={s.stepBody}>
                <label
                  className={mergeClasses(s.drop, drag && s.dropOn)}
                  data-testid="import-drop"
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDrag(true);
                  }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDrag(false);
                    const f = e.dataTransfer.files[0];
                    if (f) void onFile(f);
                  }}
                >
                  <Icon name="deployed_code" size={24} />
                  <span>
                    Drop a model here or <u>choose a file</u>
                  </span>
                  <span>IFC (.ifc) for a full import · .glb, .gltf, .obj as mesh only</span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept={ACCEPT}
                    hidden
                    data-testid="ctl-import-file"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onFile(f);
                      e.target.value = '';
                    }}
                  />
                </label>
                <p className={s.meta}>
                  The file is read in your browser and is not uploaded. Revit, Archicad, SketchUp and AutoCAD
                  files show how to export IFC.
                </p>
                {phase === 'parsing' && (
                  <Skeleton aria-label="Reading the model" data-testid="import-parsing">
                    <SkeletonItem size={16} style={{ marginBottom: 8 }} />
                    <SkeletonItem size={16} style={{ width: '70%' }} />
                  </Skeleton>
                )}
                {phase === 'error' && error && <div className={s.err}>{error}</div>}
                {phase === 'guide' && guide && (
                  <div className={s.guide} data-testid="import-guide">
                    <strong>{guide.tool} files cannot be read directly.</strong> {guide.steps}
                  </div>
                )}
                {draft && (
                  <p className={s.meta} data-testid="import-file-summary">
                    {draft.fileName} · {draft.kind === 'ifc' ? 'IFC model' : 'mesh only'}
                    {draft.concreteM3
                      ? ` · concrete ${draft.concreteM3.toFixed(0)} m³ from base quantities`
                      : ''}
                    {draft.basements ? ` · ${draft.basements.count} basement storey(s)` : ''}
                  </p>
                )}
              </div>

              <div className={s.stepHead}>
                {num(2)}
                Building
              </div>
              <div className={s.stepBody}>
                {!draft ? (
                  <p className={s.meta}>Values read from the model appear here for checking.</p>
                ) : (
                  <>
                    <Field label="Name">
                      <Input
                        value={name}
                        onChange={(_, d) => setName(d.value)}
                        data-testid="ctl-import-name"
                      />
                    </Field>
                    <div className={s.row}>
                      <Field label="Use">
                        <select
                          className="env-field"
                          value={use}
                          onChange={(e) => setUse(e.target.value as BuildingSpec['use'])}
                          data-testid="ctl-import-use"
                        >
                          {USES.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </Field>
                      {draft.kind === 'mesh' && (
                        <Field label="Model drawn in">
                          <select
                            className="env-field"
                            value={unit}
                            onChange={(e) => {
                              const u = Number(e.target.value);
                              setUnit(u);
                              if (heightAuto) setHeight(fromModel(floorsN, u));
                            }}
                            data-testid="ctl-import-unit"
                          >
                            {UNITS.map((u) => (
                              <option key={u.value} value={u.value}>
                                {u.label}
                              </option>
                            ))}
                          </select>
                        </Field>
                      )}
                    </div>
                    <div className={s.row}>
                      <Field label="Floors above ground">
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          value={floors}
                          onChange={(_, d) => {
                            const v = nonNegative(d.value);
                            setFloors(v);
                            if (heightAuto) setHeight(fromModel(Number(v), unit));
                          }}
                          data-testid="ctl-import-floors"
                        />
                      </Field>
                      <Field label="Floor-to-floor (m)">
                        <Input
                          type="number"
                          min={0}
                          step={0.05}
                          value={height}
                          onChange={(_, d) => {
                            setHeight(nonNegative(d.value));
                            setHeightAuto(false);
                          }}
                          data-testid="ctl-import-height"
                        />
                      </Field>
                    </div>
                    {warningsFor('floors')}
                    {warningsFor('floorToFloorM')}
                    {modelHeightM !== null && (
                      <p className={s.meta} data-testid="import-model-height">
                        Model height above ground: {modelHeightM.toFixed(1)} m
                      </p>
                    )}
                    {heightMismatch && (
                      <div className={s.warn} data-testid="import-height-mismatch">
                        {floorsN} floors × {heightN.toFixed(2)} m = {enteredM.toFixed(1)} m, but the model is{' '}
                        {modelHeightM!.toFixed(1)} m tall.{' '}
                        <button
                          type="button"
                          className="env-btn env-btn--text env-btn--sm env-state"
                          data-testid="ctl-import-use-model-height"
                          onClick={() => {
                            setHeight(fromModel(floorsN, unit));
                            setHeightAuto(true);
                          }}
                        >
                          Use the model&apos;s height
                        </button>
                      </div>
                    )}
                    <Field label="Window-to-wall ratio by facade (0–0.9)">
                      <div className={s.row4}>
                        {ORIENTS.map((o) => (
                          <Input
                            key={o}
                            type="number"
                            min={0}
                            max={0.9}
                            step={0.05}
                            aria-label={`Window-to-wall ratio ${o}`}
                            contentBefore={<span>{o}</span>}
                            placeholder={computedWwr(o)}
                            value={wwr[o] ?? ''}
                            onChange={(_, d) => setWwr((w) => ({ ...w, [o]: nonNegative(d.value) }))}
                            data-testid={`ctl-import-wwr-${o}`}
                          />
                        ))}
                      </div>
                    </Field>
                    <p className={s.meta}>
                      Empty fields use the model&apos;s value shown in grey; it follows the rotation.
                    </p>
                    {warningsFor('wwr')}
                    {warningsFor('footprint')}
                    {warningsFor('quantities')}
                    {warningsFor('basements')}
                  </>
                )}
              </div>

              <div className={s.stepHead}>
                {num(3)}
                Location
              </div>
              <div className={s.stepBody}>
                {!draft ? (
                  <p className={s.meta}>After the model is read, place it at its site.</p>
                ) : (
                  <>
                    <Field label="Search address (press Enter)">
                      <Input
                        value={query}
                        onChange={(_, d) => setQuery(d.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void search();
                        }}
                        contentBefore={<Icon name="search" size={18} />}
                        data-testid="ctl-import-search"
                      />
                    </Field>
                    {searching && (
                      <Skeleton aria-label="Searching">
                        <SkeletonItem size={16} />
                      </Skeleton>
                    )}
                    {searchError && <div className={s.err}>{searchError}</div>}
                    {found && (
                      <>
                        <ul className={s.results}>
                          {found.results.length === 0 && (
                            <li className={s.meta}>No places found in India.</li>
                          )}
                          {found.results.map((r, i) => (
                            <li key={`${r.lat},${r.lon}`}>
                              <button
                                type="button"
                                className={mergeClasses(s.result, 'env-state')}
                                data-testid={`ctl-import-result-${i}`}
                                onClick={() => {
                                  setLat(r.lat.toFixed(6));
                                  setLon(r.lon.toFixed(6));
                                  setLabel(r.label.split(',').slice(0, 3).join(','));
                                }}
                              >
                                {r.label}
                              </button>
                            </li>
                          ))}
                        </ul>
                        <p className={s.meta}>{found.attribution}</p>
                      </>
                    )}
                    <div className={s.row}>
                      <Field label="Latitude (° N)">
                        <Input
                          value={lat}
                          onChange={(_, d) => {
                            const pair = parsePair(d.value);
                            if (pair) {
                              setLat(String(pair[0]));
                              setLon(String(pair[1]));
                            } else setLat(nonNegative(d.value));
                          }}
                          data-testid="ctl-import-lat"
                        />
                      </Field>
                      <Field label="Longitude (° E)">
                        <Input
                          value={lon}
                          onChange={(_, d) => setLon(nonNegative(d.value))}
                          data-testid="ctl-import-lon"
                        />
                      </Field>
                    </div>
                    <p className={s.meta}>
                      You can paste a Google Maps pair such as 28.4060, 77.0850 into Latitude.
                    </p>
                    {draft.ifcSite && (
                      <button
                        type="button"
                        className="env-btn env-btn--text env-btn--sm env-state"
                        data-testid="ctl-import-file-site"
                        onClick={() => {
                          setLat(draft.ifcSite!.lat.toFixed(6));
                          setLon(draft.ifcSite!.lon.toFixed(6));
                          setLabel(`${draft.name} site (from the file)`);
                        }}
                      >
                        <Icon name="my_location" size={18} />
                        Use the file&apos;s coordinates ({draft.ifcSite.lat.toFixed(4)},{' '}
                        {draft.ifcSite.lon.toFixed(4)})
                      </button>
                    )}
                    {warningsFor('location')}
                    <Field label="Site name">
                      <Input
                        value={label}
                        onChange={(_, d) => setLabel(d.value)}
                        data-testid="ctl-import-label"
                      />
                    </Field>
                    <Field label={`Rotation: ${rotation}° clockwise (drag, type 0–359, or turn by 90°)`}>
                      <div className={s.rotate}>
                        <Slider
                          className={s.rotSlider}
                          min={0}
                          max={359}
                          value={rotation}
                          onChange={(_, d) => setRotation(d.value)}
                          data-testid="ctl-import-rotation"
                        />
                        <div className={s.rotInput}>
                          <Input
                            type="number"
                            min={0}
                            max={359}
                            step={1}
                            aria-label="Rotation in degrees, clockwise"
                            contentAfter={<span>°</span>}
                            value={rotationText}
                            onChange={(_, d) => {
                              const v = nonNegative(d.value);
                              setRotationText(v);
                              if (v.trim() !== '' && Number.isFinite(Number(v)))
                                setRotation(wrapDeg(Number(v)));
                            }}
                            onBlur={() => setRotationText(String(rotation))}
                            data-testid="ctl-import-rotation-deg"
                          />
                        </div>
                        <IconButton
                          icon="rotate_left"
                          label="Turn 90° anticlockwise"
                          testId="ctl-import-rotate-ccw"
                          onClick={() => setRotation((v) => wrapDeg(v - 90))}
                        />
                        <IconButton
                          icon="rotate_right"
                          label="Turn 90° clockwise"
                          testId="ctl-import-rotate-cw"
                          onClick={() => setRotation((v) => wrapDeg(v + 90))}
                        />
                      </div>
                    </Field>
                    <Field label="Plot buffer around the building (m)">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={buffer}
                        onChange={(_, d) => setBuffer(nonNegative(d.value))}
                        data-testid="ctl-import-buffer"
                      />
                    </Field>
                  </>
                )}
              </div>
              <div className={s.actions}>
                <button
                  type="button"
                  className="env-btn env-btn--filled env-btn--icon-lead env-state"
                  disabled={!draft || problems.length > 0}
                  onClick={() => void place()}
                  data-testid="ctl-import-place"
                >
                  <Icon name="where_to_vote" size={18} />
                  Place building
                </button>
                {source.kind !== 'demo' && (
                  <button
                    type="button"
                    className="env-btn env-btn--outlined env-state"
                    onClick={() => {
                      useAppStore.getState().resetBuilding();
                      setOpen(false);
                      reset();
                    }}
                    data-testid="ctl-import-reset"
                  >
                    Use demo building
                  </button>
                )}
              </div>
            </DialogContent>
            <DragHandle
              value={split}
              min={30}
              max={70}
              initial={50}
              step={2}
              pxPerUnit={(colsRef.current?.clientWidth ?? 1000) / 100}
              onChange={setSplit}
              side="left"
              label="Form width"
              testId="ctl-import-split"
            />
            <div className={s.preview} data-testid="import-preview">
              {candidate && t ? (
                <>
                  <FootprintPreview spec={candidate} />
                  <div className={s.facts} data-testid="import-facts">
                    Footprint {t.footprintAreaM2.toFixed(0)} m² · {candidate.floors} floors ·{' '}
                    {t.heightM.toFixed(1)} m tall · GFA {t.gfaM2.toFixed(0)} m²
                  </div>
                  {problems.length > 0 && (
                    <ul className={s.problems} data-testid="import-problems">
                      {problems.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <EmptyState
                  icon="deployed_code"
                  title={phase === 'parsing' ? 'Reading the model…' : 'No model yet'}
                  text={
                    source.kind === 'demo'
                      ? 'Choose an IFC file to see its footprint here, then place it at its site.'
                      : `Current building: ${current.name} (${source.fileName ?? 'imported'}).`
                  }
                />
              )}
            </div>
          </div>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

/** Top-down footprint with north up, facade orientations and a scale, for lining the building up. */
function FootprintPreview({ spec }: { spec: BuildingSpec }) {
  const pts = spec.footprint.map(([lon, lat]) =>
    toLocalEN({ lon, lat }, { lon: spec.site.lon, lat: spec.site.lat }),
  );
  const t = takeoff(spec);
  const r = Math.max(10, ...pts.map((p) => Math.hypot(p.e, p.n))) * 1.35;
  const view = `${-r} ${-r} ${2 * r} ${2 * r}`;
  const poly = pts.map((p) => `${p.e},${-p.n}`).join(' ');
  const scaleM = [5, 10, 20, 50, 100, 200].find((v) => v >= r / 3) ?? 200;
  return (
    <svg
      viewBox={view}
      role="img"
      aria-label="Footprint preview, north up"
      style={{ width: '100%', maxWidth: 560, flexGrow: 1, minHeight: 0 }}
    >
      <polygon points={poly} fill="var(--primary-container)" stroke="var(--primary)" strokeWidth={r / 120} />
      {t.facades.map((f) => {
        const a = pts[f.index]!;
        const b = pts[(f.index + 1) % pts.length]!;
        const mx = (a.e + b.e) / 2 + Math.sin((f.normalAzimuthDeg * Math.PI) / 180) * r * 0.08;
        const my = -((a.n + b.n) / 2 + Math.cos((f.normalAzimuthDeg * Math.PI) / 180) * r * 0.08);
        return (
          <text
            key={f.index}
            x={mx}
            y={my}
            fontSize={r / 14}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--on-surface-variant)"
          >
            {f.orientation}
          </text>
        );
      })}
      <g transform={`translate(${r * 0.8}, ${-r * 0.75})`}>
        <path
          d={`M0 ${-r * 0.1} L${r * 0.04} ${r * 0.04} L0 0 L${-r * 0.04} ${r * 0.04} Z`}
          fill="var(--on-surface)"
        />
        <text y={-r * 0.13} fontSize={r / 14} textAnchor="middle" fill="var(--on-surface)">
          N
        </text>
      </g>
      <g transform={`translate(${-r * 0.9}, ${r * 0.88})`}>
        <line x1={0} y1={0} x2={scaleM} y2={0} stroke="var(--on-surface)" strokeWidth={r / 150} />
        <text x={scaleM / 2} y={-r * 0.03} fontSize={r / 16} textAnchor="middle" fill="var(--on-surface)">
          {scaleM} m
        </text>
      </g>
    </svg>
  );
}
