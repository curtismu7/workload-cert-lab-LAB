import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Background, BackgroundVariant, Controls, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import DiagramStepBar from './components/DiagramStepBar.jsx';
import { REFIT_EVENT, useFitOnResize } from './hooks/useFitOnResize';
import { useDiagramStepper } from './hooks/useDiagramStepper';
import { ArrowNoLabel, EdgeLabels, FitOpen, Passport, PassportActions } from './diagram-kit/DiagramKit.jsx';
import { boxPassport, sidePoint } from './diagram-kit/diagramKit.js';
import './diagram-kit/diagram-kit.css';
import TopMenu from './top-menu/TopMenu.jsx';
import './top-menu/top-menu.css';
import Json from './json/JsonPane.jsx';
import './json/JsonPane.css';
import './standalone-ui.css';
import './app.css';

const nodePos = (p) => p || { x: 0, y: 0 };


const PATTERN = {
  title: 'The mTLS handshake',
  nodes: [
    { id: 'ca', label: 'Trust-domain CA', kind: 'idp', x: 40, y: 90 },
    { id: 'client', label: 'Client workload', kind: 'gateway', x: 380, y: 20 },
    { id: 'server', label: 'Server workload', kind: 'resource', x: 380, y: 190 },
  ],
  steps: [
    { from: 'ca', to: 'client', label: '1. signed SVID', say: 'The CA signs a short-lived certificate for the client: EC P-256, SAN URI spiffe://corp.example.com/<path>. The cert is the identity; no shared secret.' },
    { from: 'ca', to: 'server', label: '2. signed SVID', say: 'The server gets its own SVID the same way. Both sides trust only the corp.example.com root.' },
    { from: 'client', to: 'server', label: '3. mTLS both ways', say: 'The handshake: server presents its cert (client verifies against the root), client presents its cert (server verifies the same way). The server then authorizes on the client SAN URI.' },
  ],
};

const GRAPH = {
  nodes: PATTERN.nodes.map((n) => ({ id: n.id, label: n.label, group: n.kind, groupLabel: n.kind === 'idp' ? 'trust anchor' : n.kind })),
  edges: PATTERN.steps.map((s, i) => ({ source: s.from, target: s.to, label: `${i + 1}. ${s.label}` })),
};

const initialPositions = Object.fromEntries(PATTERN.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));

function Box({ data }) {
  const HANDLES = [["t", Position.Top], ["b", Position.Bottom], ["l", Position.Left], ["r", Position.Right]];
  return (
    <div className={`wcl-node wcl-node--${data.kind}${data.on ? ' wcl-node--on' : ''}${data.passport ? ' dk-open' : ''}`} data-testid={`wcl-node-${data.id}`}>
      {HANDLES.map(([k, pos]) => (
        <span key={k}>
          <Handle id={`s-${k}`} type="source" position={pos} className="wcl-handle" />
          <Handle id={`t-${k}`} type="target" position={pos} className="wcl-handle" />
        </span>
      ))}
      {data.label}
      {data.passport && <Passport p={data.passport} />}
    </div>
  );
}
const nodeTypes = { box: Box };
const edgeTypes = { arrow: ArrowNoLabel };

function sides(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? ['r', 'l'] : ['l', 'r']) : (dy > 0 ? ['b', 't'] : ['t', 'b']);
}

function CertCanvas({ positions, onMove, stepper, open, setOpen }) {
  const ref = useRef(null);
  const FIT = { padding: 0.08 };
  useFitOnResize(ref, FIT);
  const active = stepper.step >= 0 ? PATTERN.steps[stepper.step] : null;
  const nodes = PATTERN.nodes.map((n) => ({
    id: n.id, type: 'box', position: positions[n.id], draggable: true, zIndex: n.id === open ? 10 : undefined,
    data: { id: n.id, label: n.label, kind: n.kind, on: !!active && (active.from === n.id || active.to === n.id), passport: n.id === open ? boxPassport(GRAPH, n.id) : null },
  }));
  const edges = PATTERN.steps.map((s, i) => {
    const [a, b] = sides(positions[s.from], positions[s.to]);
    const now = stepper.step === i;
    const seen = stepper.step >= 0 && i <= stepper.step;
    return {
      id: `e${i}`, source: s.from, target: s.to, sourceHandle: `s-${a}`, targetHandle: `t-${b}`, type: 'arrow',
      animated: now,
      className: `wcl-edge${now ? ' wcl-edge--now' : ''}${stepper.step >= 0 && !seen ? ' wcl-edge--dim' : ''}`,
      markerEnd: { type: MarkerType.ArrowClosed },
    };
  });
  const labels = PATTERN.steps.map((s, i) => ({
    id: `e${i}`, text: `${i + 1}. ${s.label}`, source: s.from, target: s.to, sourceHandle: edges[i].sourceHandle, targetHandle: edges[i].targetHandle,
    active: stepper.step === i, dim: stepper.step >= 0 && !(i <= stepper.step),
  }));
  const actions = useMemo(() => ({
    open: (id) => setOpen(id), close: () => setOpen(null),
    link: (id) => { const u = new URL(window.location.href); u.searchParams.set('box', id); return u.toString(); },
  }), [setOpen]);
  return (
    <div ref={ref} className="wcl-canvas" data-testid="wcl-canvas">
      <PassportActions.Provider value={actions}>
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView fitViewOptions={FIT} nodesConnectable={false} minZoom={0.3}
          onNodeClick={(_, n) => setOpen((o) => (o === n.id ? null : n.id))} onPaneClick={() => setOpen(null)}
          onNodeDragStop={(_, n) => onMove(n.id, n.position)} onNodeDrag={(_, n) => onMove(n.id, n.position)} proOptions={{ hideAttribution: true }}>
          <Background variant={BackgroundVariant.Dots} gap={18} />
          <Controls showInteractive={false} />
          <EdgeLabels items={labels} pointFor={(box, handle) => sidePoint(box, String(handle).split('-')[1])} fallback={{ w: 150, h: 50 }} />
          <FitOpen open={open} closePadding={FIT.padding} />
        </ReactFlow>
      </PassportActions.Provider>
    </div>
  );
}

const ATTACKS = [
  { kind: 'foreign-domain', label: 'Foreign trust domain', note: 'a cert whose SAN names rogue.example.com' },
  { kind: 'expired', label: 'Expired SVID', note: 'validated against a clock past notAfter' },
  { kind: 'tampered', label: 'Tampered cert', note: 'one flipped byte in the certificate' },
];

export default function App() {
  const [health, setHealth] = useState(null);
  const [info, setInfo] = useState(null);
  const [story, setStory] = useState(null);
  const [root, setRoot] = useState(null);
  const [svid, setSvid] = useState(null);
  const [handshake, setHandshake] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [present, setPresent] = useState(false);
  const [talkTrack, setTalkTrack] = useState(false);
  const [theme, setTheme] = useState('auto');
  const [fontSize, setFontSize] = useState('M');
  const [mode, setMode] = useState('mock');
  const [path, setPath] = useState('/orders');

  useEffect(() => {
    fetch('/api/health').then((r) => r.json()).then(setHealth).catch(() => {});
    fetch('/api/info').then((r) => r.json()).then((i) => { setInfo(i); setMode(i.source); }).catch(() => {});
    fetch('/api/story').then((r) => r.json()).then(setStory).catch(() => {});
    fetch('/api/root').then((r) => r.json()).then(setRoot).catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const switchMode = async (next) => {
    const r = await fetch('/api/mode', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: next }),
    });
    if (r.ok) {
      setMode(next);
      const i = await (await fetch('/api/info')).json();
      setInfo(i);
    }
  };

  const mint = async () => {
    setBusy(true); setResult(null); setHandshake(null);
    const r = await (await fetch('/api/svid', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    })).json();
    setSvid(r); setBusy(false);
  };

  const runHandshake = async () => {
    setBusy(true); setResult(null);
    const r = await (await fetch('/api/handshake', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientPath: path, serverPath: '/billing' }),
    })).json();
    setHandshake(r); setBusy(false);
  };

  const runAttack = async (kind) => {
    setBusy(true); setHandshake(null);
    const r = await (await fetch('/api/attack', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind }),
    })).json();
    setResult(r); setBusy(false);
  };

  const stepper = useDiagramStepper(PATTERN.steps.length);
  const [positions, setPositions] = useState(initialPositions);
  const [open, setOpen] = useState(() => { const box = new URLSearchParams(window.location.search).get('box'); return box && PATTERN.nodes.some((n) => n.id === box) ? box : null; });
  const step = stepper.step >= 0 ? PATTERN.steps[stepper.step] : null;

  const reset = useCallback(() => {
    stepper.stop();
    setPositions(initialPositions);
    setSvid(null); setHandshake(null); setResult(null); setPath('/orders');
    setOpen(null);
    setTimeout(() => window.dispatchEvent(new Event(REFIT_EVENT)), 0);
  }, [stepper.stop]);


  return (
    <div className="lab">
      <header className="shell-bar">
        <h1>Workload Cert Lab</h1>
        <TopMenu
          mode={{ value: mode, onChange: switchMode, realAvailable: info?.realAvailable, realHint: info?.realHint }}
          theme={{ value: theme, onChange: setTheme }}
          fontSize={{ value: fontSize, onChange: setFontSize }}
          present={{ active: present, onToggle: () => setPresent((p) => !p) }}
          talkTrack={{ active: talkTrack, onToggle: () => setTalkTrack((t) => !t) }}
          onReset={reset}
        />
      </header>
      <div className="banner">Simulation: the CA, certificates and handshake are in-process mocks using real X.509 (openssl). Nothing leaves this container. Mode: {mode}.</div>
      {present && story && (
        <section className="card result">
          <h2>{story.title} (presenter mode)</h2>
          <ol>
            {story.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </section>
      )}
      {talkTrack && story && (
        <section className="card result">
          <h2>Talk track</h2>
          <ol>
            {story.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </section>
      )}

      <section className="cards">
        <div className="card">
          <h2>Identity flow</h2>
          <p>The trust-domain root CA signs short-lived workload certificates (SPIFFE SVID style). Each cert carries a SPIFFE URI in its Subject Alternative Name. A workload-to-workload call runs mutual TLS: both sides present a cert and both verify it against the same root.</p>
          <DiagramStepBar stepper={stepper} caption={step ? step.label : ''} testId="wcl-step-bar" />
          {step && (
            <article className="track__now" data-testid="wcl-now">
              <h3>Step {stepper.step + 1}: {step.label}</h3>
              <p>{step.say}</p>
            </article>
          )}
          <ReactFlowProvider>
            <CertCanvas positions={positions} onMove={(id, p) => setPositions((cur) => ({ ...cur, [id]: { x: p.x, y: p.y } }))} stepper={stepper} open={open} setOpen={setOpen} />
          </ReactFlowProvider>
          <div className="controls">
            <label>
              Path
              <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/orders" />
            </label>
            <button className="primary" onClick={mint} disabled={busy}>Mint SVID</button>
            <button onClick={runHandshake} disabled={busy || !svid}>Run mTLS handshake</button>
          </div>
        </div>

        <div className="card">
          <h2>Break it</h2>
          <p>Each attack shows the exact refusal the verification chain produces.</p>
          <div className="attack-grid">
            {ATTACKS.map((a) => (
              <button key={a.kind} onClick={() => runAttack(a.kind)} disabled={busy} title={a.note}>
                {a.label}
              </button>
            ))}
          </div>
          {root && (
            <p className="muted">Root CA: {root.rootSubject} · sha256 {String(root.rootFingerprint).slice(0, 24)}…</p>
          )}
        </div>
      </section>

      {svid && (
        <section className="card result">
          <h2>SVID</h2>
          <p className="pass">{svid.spiffeId}</p>
          <p className="muted">serial {svid.serial} · notAfter {String(svid.notAfter).slice(0, 19)} · sha256 {svid.fingerprint.slice(0, 32)}…</p>
          {svid.ttlNote && <p className="muted">{svid.ttlNote}</p>}
          <Json value={svid.certPem} label="SVID certificate (PEM)" hot={['spiffeId']} />
        </section>
      )}

      {handshake && (
        <section className="card result">
          <h2>Handshake</h2>
          <p className={handshake.complete ? 'pass' : 'refused'}>{handshake.complete ? 'MUTUAL TLS COMPLETE — both identities verified' : 'HANDSHAKE FAILED'}</p>
          <ol>
            {handshake.steps.map((s) => (
              <li key={s.step}>
                <strong>{s.name}</strong> — {s.detail}
                {s.verdict && <> · <span className={s.verdict === 'allowed' || s.verdict.startsWith('verified') ? 'pass' : 'refused'}>{s.verdict}</span></>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {result && (
        <section className="card result">
          <h2>Result</h2>
          <p className={result.valid ? 'pass' : 'refused'}>{result.valid ? 'ACCEPTED (unexpected)' : 'REFUSED'} — {result.kind}</p>
          {result.note && <p className="muted">{result.note}</p>}
          <Json value={result.failures} label="Failures" hot={['failures']} />
        </section>
      )}

      <footer className="muted">
        {health ? `health: ${health.status} (${health.catalogId})` : 'health: unknown'} · SPIFFE-style SVIDs, IETF WIMSE mutual-tls draft · mock only
      </footer>
    </div>
  );
}
