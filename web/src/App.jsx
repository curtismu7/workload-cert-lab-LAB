import React, { useEffect, useState } from 'react';
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';
import TopMenu from './top-menu/TopMenu.jsx';
import './top-menu/top-menu.css';
import Json from './json/JsonPane.jsx';
import './json/JsonPane.css';
import './standalone-ui.css';
import './app.css';

const nodePos = (p) => p || { x: 0, y: 0 };

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

  const reset = () => { setSvid(null); setHandshake(null); setResult(null); setPath('/orders'); };

  const nodes = [
    { id: 'ca', position: nodePos({ x: 0, y: 60 }), data: { label: `Trust-domain CA\n${root?.trustDomain || '…'}` } },
    { id: 'client', position: nodePos({ x: 320, y: 0 }), data: { label: `Client workload\n${svid?.spiffeId || 'spiffe://…'}` } },
    { id: 'server', position: nodePos({ x: 320, y: 160 }), data: { label: 'Server workload\nspiffe://…/billing' } },
  ];
  const edges = [
    { id: 'e1', source: 'ca', target: 'client', label: 'signed SVID' },
    { id: 'e2', source: 'ca', target: 'server', label: 'signed SVID' },
    { id: 'e3', source: 'client', target: 'server', label: 'mTLS both ways' },
  ];

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
          <div style={{ height: 300 }}>
            <ReactFlow nodes={nodes} edges={edges} onNodesChange={() => {}}>
              <Background />
              <Controls />
            </ReactFlow>
          </div>
          <div className="controls">
            <label>
              Path
              <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/orders" />
            </label>
            <button className="primary" onClick={mint} disabled={busy}>Mint SVID</button>
            <button onClick={runHandshake} disabled={busy || !svid}>Run mTLS handshake</button>
            <label>
              Speed
              <select value="1" disabled>
                <option value="1">1×</option>
              </select>
            </label>
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
