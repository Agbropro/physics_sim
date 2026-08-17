/* Control panel — physics settings, shape picker, and action buttons */

import { useState } from 'react';
import type { ShapeKind, IntegrationMode, SimSettings } from '../types/shapes';

interface Props {
  settings: SimSettings;
  onSettingsChange: (s: SimSettings) => void;
  activeTool: ShapeKind | 'edit';
  onToolChange: (tool: ShapeKind | 'edit') => void;
  onCalculateCom: () => void;
  onRunGravity: () => void;
  onClear: () => void;
  isSimulating: boolean;
  onStopSim: () => void;
  frameInfo: string;
}

export default function ControlPanel({
  settings,
  onSettingsChange,
  activeTool,
  onToolChange,
  onCalculateCom,
  onRunGravity,
  onClear,
  isSimulating,
  onStopSim,
  frameInfo,
}: Props) {
  const set = <K extends keyof SimSettings>(key: K, value: SimSettings[K]) =>
    onSettingsChange({ ...settings, [key]: value });

  const [showHelp, setShowHelp] = useState(false);

  return (
    <>
      <aside className="control-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>⚙ Controls</h2>
          <button className="btn-muted" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={() => setShowHelp(true)}>
            ❓ Help
          </button>
        </div>

        {/* ── Shape picker ── */}
      <fieldset>
        <legend>Shape</legend>
        <div className="shape-buttons">
          {(['rectangle', 'circle', 'polygon', 'edit'] as const).map((k) => (
            <button
              key={k}
              className={activeTool === k ? 'active' : ''}
              onClick={() => onToolChange(k)}
              disabled={isSimulating}
            >
              {k === 'rectangle' ? '▭ Rect' : k === 'circle' ? '⬤ Circ' : k === 'polygon' ? '⬟ Poly' : '✋ Edit'}
            </button>
          ))}
        </div>
      </fieldset>

      {/* ── Physics ── */}
      <fieldset>
        <legend>Physics</legend>

        <label>
          Gravity (px/s²)
          <input
            type="range" min="100" max="3000" step="10"
            value={settings.gravity}
            onChange={(e) => set('gravity', +e.target.value)}
          />
          <span className="val">{settings.gravity}</span>
        </label>

        <label>
          Restitution
          <input
            type="range" min="0" max="1" step="0.05"
            value={settings.restitution}
            onChange={(e) => set('restitution', +e.target.value)}
          />
          <span className="val">{settings.restitution}</span>
        </label>

        <label>
          Velocity Retention
          <input
            type="range" min="0.0" max="1" step="0.001"
            value={settings.airResistance}
            onChange={(e) => set('airResistance', +e.target.value)}
          />
          <span className="val">{settings.airResistance}</span>
        </label>

        <label>
          Ground Friction
          <input
            type="range" min="0" max="1" step="0.05"
            value={settings.groundFriction}
            onChange={(e) => set('groundFriction', +e.target.value)}
          />
          <span className="val">{settings.groundFriction}</span>
        </label>

        <label>
          Angular Damping
          <input
            type="range" min="0.0" max="1" step="0.005"
            value={settings.angularDamping}
            onChange={(e) => set('angularDamping', +e.target.value)}
          />
          <span className="val">{settings.angularDamping}</span>
        </label>

        <label>
          Overlap Threshold
          <input
            type="range" min="0" max="1" step="0.05"
            value={settings.overlapThreshold}
            onChange={(e) => set('overlapThreshold', +e.target.value)}
          />
          <span className="val">{settings.overlapThreshold}</span>
        </label>

        <label>
          Density (ρ)
          <input
            type="range" min="0.1" max="5" step="0.1"
            value={settings.rho}
            onChange={(e) => set('rho', +e.target.value)}
          />
          <span className="val">{settings.rho}</span>
        </label>
      </fieldset>

      {/* ── Ground ── */}
      <fieldset>
        <legend>Ground</legend>
        <label>
          Ground Offset (px)
          <input
            type="range" min="0" max="300" step="5"
            value={settings.groundOffset}
            onChange={(e) => set('groundOffset', +e.target.value)}
          />
          <span className="val">{settings.groundOffset}</span>
        </label>
      </fieldset>

      {/* ── Integration ── */}
      <fieldset>
        <legend>Integration</legend>
        <div className="shape-buttons" style={{ marginBottom: '10px' }}>
          {(['euler', 'verlet'] as IntegrationMode[]).map((m) => (
            <button
              key={m}
              className={settings.integration === m ? 'active' : ''}
              onClick={() => set('integration', m)}
            >
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
        <label>
          Max Frames
          <input
            type="range" min="60" max="3600" step="60"
            value={settings.maxFrames}
            onChange={(e) => set('maxFrames', +e.target.value)}
          />
          <span className="val">{settings.maxFrames}</span>
        </label>
      </fieldset>

      {/* ── Actions ── */}
      <div className="actions" style={{ marginTop: 'auto' }}>
        {isSimulating ? (
          <button className="btn-danger" onClick={onStopSim}>
            ⏹ Stop
          </button>
        ) : (
          <>
            <button className="btn-primary" onClick={onCalculateCom}>
              📐 Calculate COM
            </button>
            <button className="btn-accent" onClick={onRunGravity}>
              🚀 Run Gravity
            </button>
            <button className="btn-danger" onClick={onClear} style={{ background: 'transparent', color: '#ef5350', border: '1px solid #ef5350' }}>
              🗑 Clear Canvas
            </button>
          </>
        )}
      </div>

      {frameInfo && <div className="frame-info">{frameInfo}</div>}
      </aside>

      {/* ── Help Modal ── */}
      {showHelp && (
        <div className="help-modal-overlay" onClick={() => setShowHelp(false)}>
          <div className="help-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="help-modal-header">
              <h2>Physics Parameters Guide</h2>
              <button className="close-btn" onClick={() => setShowHelp(false)}>✖</button>
            </div>
            <div className="help-modal-body">
              <div className="help-item">
                <div className="help-label">Gravity <span className="range-hint">[100 - 3000]</span></div>
                <div className="help-desc">How fast objects accelerate downwards (pixels per second squared). Higher values mean stronger gravity.</div>
              </div>
              <div className="help-item">
                <div className="help-label">Restitution <span className="range-hint">[0.0 - 1.0]</span></div>
                <div className="help-desc">Bounciness. 1.0 means perfect bounce (retains all energy). 0.0 means it hits the ground like a wet beanbag (no bounce).</div>
              </div>
              <div className="help-item">
                <div className="help-label">Velocity Retention <span className="range-hint">[0.0 - 1.0]</span></div>
                <div className="help-desc">How much velocity is kept each frame. 1.0 = vacuum (no air drag). 0.9 = very high air drag. 0.0 = completely frozen in the air.</div>
              </div>
              <div className="help-item">
                <div className="help-label">Ground Friction <span className="range-hint">[0.0 - 1.0]</span></div>
                <div className="help-desc">How quickly an object stops sliding and spinning on the ground. 1.0 = perfectly sticky floor. 0.0 = perfectly slippery ice.</div>
              </div>
              <div className="help-item">
                <div className="help-label">Angular Damping <span className="range-hint">[0.0 - 1.0]</span></div>
                <div className="help-desc">How much spin speed is kept each frame. 1.0 = spins forever. 0.9 = spin slows down quickly while falling.</div>
              </div>
              <div className="help-item">
                <div className="help-label">Overlap Threshold <span className="range-hint">[0.0 - 1.0]</span></div>
                <div className="help-desc">If drawn shapes overlap by this percentage (e.g., 0.3 means 30%), they are glued together into one rigid body!</div>
              </div>
              <div className="help-item">
                <div className="help-label">Density (ρ) <span className="range-hint">[0.1 - 10]</span></div>
                <div className="help-desc">Multiplier for the mass of the objects. Larger/heavier objects are harder to spin and push around.</div>
              </div>
              <div className="help-item">
                <div className="help-label">Max Frames <span className="range-hint">[60 - 3600]</span></div>
                <div className="help-desc">Maximum number of frames simulated before stopping (60 frames = 1 second of recorded physics playback).</div>
              </div>
              <div className="help-item">
                <div className="help-label">Integration</div>
                <div className="help-desc">The mathematical solver used. Verlet is generally more stable and realistic for rigid bodies than Euler.</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
