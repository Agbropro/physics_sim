/* Main application — wires canvas, controls, and API together */

import { useState, useCallback } from 'react';
import DrawingCanvas from './components/DrawingCanvas';
import ControlPanel from './components/ControlPanel';
import { useSimulation } from './hooks/useSimulation';
import { fetchCom, fetchSimulate } from './api/client';
import type { CanvasShape, ShapeKind, ComResponse, SimSettings } from './types/shapes';
import { DEFAULT_SETTINGS } from './types/shapes';

const CANVAS_W = Number(import.meta.env.VITE_CANVAS_WIDTH) || 800;
const CANVAS_H = Number(import.meta.env.VITE_CANVAS_HEIGHT) || 600;

export default function App() {
  const [shapes, setShapes] = useState<CanvasShape[]>([]);
  const [activeTool, setActiveTool] = useState<ShapeKind | 'edit'>('rectangle');
  const [settings, setSettings] = useState<SimSettings>(DEFAULT_SETTINGS);
  const [comResult, setComResult] = useState<ComResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sim = useSimulation(60);

  /* ── Clear stale COM when shapes change ── */
  const handleShapesChange = useCallback((newShapes: CanvasShape[]) => {
    setShapes(newShapes);
    setComResult(null);
    setError(null);
  }, []);

  /* ── Calculate COM ── */
  const handleCalculateCom = useCallback(async () => {
    if (shapes.length === 0) return;
    setError(null);
    try {
      const result = await fetchCom(shapes, CANVAS_W, CANVAS_H, settings);
      setComResult(result);
    } catch (e) {
      setError(String(e));
    }
  }, [shapes, settings]);

  /* ── Run gravity simulation ── */
  const handleRunGravity = useCallback(async () => {
    if (shapes.length === 0) return;
    setError(null);
    setComResult(null);
    try {
      const result = await fetchSimulate(shapes, CANVAS_W, CANVAS_H, settings);
      sim.play(result.frames);
    } catch (e) {
      setError(String(e));
    }
  }, [shapes, settings, sim]);

  /* ── Stop simulation ── */
  const handleStopSim = useCallback(() => {
    sim.stop();
  }, [sim]);

  /* ── Clear ── */
  const handleClear = useCallback(() => {
    setShapes([]);
    setComResult(null);
    setError(null);
    sim.stop();
  }, [sim]);

  const frameInfo = sim.isPlaying
    ? `Frame ${sim.frameIndex + 1} / ${sim.totalFrames}`
    : '';

  return (
    <div className="app-layout">
      <header className="app-header">
        <h1>⚛ Gravity Simulator</h1>
        <p className="subtitle">Draw shapes · Compute COM · Simulate gravity</p>
      </header>

      <main className="app-main">
        <div className="canvas-wrapper">
          <DrawingCanvas
            width={CANVAS_W}
            height={CANVAS_H}
            shapes={shapes}
            onShapesChange={handleShapesChange}
            activeTool={activeTool}
            groundOffset={settings.groundOffset}
            comResult={comResult}
            simFrame={sim.currentFrame}
            initialFrame={sim.frames?.[0] || null}
          />
          {error && <div className="error-bar">{error}</div>}
          {shapes.length === 0 && !sim.isPlaying && (
            <div className="canvas-hint">
              Click &amp; drag to draw · Right-click to finish polygon
            </div>
          )}
        </div>

        <ControlPanel
          settings={settings}
          onSettingsChange={setSettings}
          activeTool={activeTool}
          onToolChange={setActiveTool}
          onCalculateCom={handleCalculateCom}
          onRunGravity={handleRunGravity}
          onClear={handleClear}
          isSimulating={sim.isPlaying}
          onStopSim={handleStopSim}
          frameInfo={frameInfo}
        />
      </main>
    </div>
  );
}
