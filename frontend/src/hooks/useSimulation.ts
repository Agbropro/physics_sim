/* Hook for animating gravity simulation frame by frame */

import { useCallback, useRef, useState } from 'react';
import type { FrameOut } from '../types/shapes';

export interface SimPlayback {
  isPlaying: boolean;
  currentFrame: FrameOut | null;
  frameIndex: number;
  totalFrames: number;
  play: (frames: FrameOut[]) => void;
  stop: () => void;
  frames: FrameOut[];
}

export function useSimulation(fps: number = 60): SimPlayback {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState<FrameOut | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);

  const rafRef = useRef<number>(0);
  const framesRef = useRef<FrameOut[]>([]);
  const indexRef = useRef(0);
  const lastTimeRef = useRef(0);
  const intervalMs = 1000 / fps;

  const animate = useCallback((timestamp: number) => {
    if (timestamp - lastTimeRef.current >= intervalMs) {
      lastTimeRef.current = timestamp;

      const frames = framesRef.current;
      const idx = indexRef.current;

      if (idx >= frames.length) {
        setIsPlaying(false);
        return;
      }

      setCurrentFrame(frames[idx]);
      setFrameIndex(idx);
      indexRef.current = idx + 1;
    }

    rafRef.current = requestAnimationFrame(animate);
  }, [intervalMs]);

  const play = useCallback((frames: FrameOut[]) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    framesRef.current = frames;
    indexRef.current = 0;
    lastTimeRef.current = 0;
    setTotalFrames(frames.length);
    setFrameIndex(0);
    setIsPlaying(true);

    rafRef.current = requestAnimationFrame(animate);
  }, [animate]);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setIsPlaying(false);
    setCurrentFrame(null);
    setFrameIndex(0);
  }, []);

  return { isPlaying, currentFrame, frameIndex, totalFrames, play, stop, frames: framesRef.current };
}
