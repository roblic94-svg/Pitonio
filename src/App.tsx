/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Trophy, RotateCcw, Play, Pause, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Volume2, VolumeX, Zap, Ghost, RefreshCw, Trash2, X, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const GRID_SIZE = 20;
const INITIAL_SNAKE = [
  { x: 10, y: 10 },
  { x: 10, y: 11 },
  { x: 10, y: 12 },
];
const INITIAL_DIRECTION = { x: 0, y: -1 };

type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

const DIFFICULTY_CONFIG = {
  EASY: { speed: 200, label: 'EASY' },
  MEDIUM: { speed: 120, label: 'MEDIUM' },
  HARD: { speed: 70, label: 'HARD' },
};

type PowerUpType = 'SPEED_BOOST' | 'GHOST_MODE' | 'REVERSE_CONTROLS';

interface PowerUp {
  x: number;
  y: number;
  type: PowerUpType;
}

const POWER_UP_CONFIG = {
  SPEED_BOOST: { color: '#fbbf24', icon: Zap, label: 'SPEED BOOST', duration: 5000 },
  GHOST_MODE: { color: '#a855f7', icon: Ghost, label: 'GHOST MODE', duration: 7000 },
  REVERSE_CONTROLS: { color: '#3b82f6', icon: RefreshCw, label: 'REVERSED', duration: 6000 },
};

// Sound Engine using Web Audio API
const playSound = (type: 'move' | 'eat' | 'gameover' | 'powerup' | 'expire', isMuted: boolean) => {
  if (isMuted) return;
  
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioContextClass();
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  const now = audioCtx.currentTime;

  switch (type) {
    case 'move':
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(150, now);
      oscillator.frequency.exponentialRampToValueAtTime(50, now + 0.05);
      gainNode.gain.setValueAtTime(0.05, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
      oscillator.start(now);
      oscillator.stop(now + 0.05);
      break;
    case 'eat':
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(400, now);
      oscillator.frequency.exponentialRampToValueAtTime(800, now + 0.1);
      gainNode.gain.setValueAtTime(0.1, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      oscillator.start(now);
      oscillator.stop(now + 0.1);
      break;
    case 'gameover':
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(300, now);
      oscillator.frequency.linearRampToValueAtTime(50, now + 0.5);
      gainNode.gain.setValueAtTime(0.1, now);
      gainNode.gain.linearRampToValueAtTime(0.01, now + 0.5);
      oscillator.start(now);
      oscillator.stop(now + 0.5);
      break;
    case 'powerup':
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(200, now);
      oscillator.frequency.exponentialRampToValueAtTime(1200, now + 0.2);
      gainNode.gain.setValueAtTime(0.1, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      oscillator.start(now);
      oscillator.stop(now + 0.2);
      break;
    case 'expire':
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(800, now);
      oscillator.frequency.exponentialRampToValueAtTime(200, now + 0.3);
      gainNode.gain.setValueAtTime(0.05, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      oscillator.start(now);
      oscillator.stop(now + 0.3);
      break;
  }
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [snake, setSnake] = useState(INITIAL_SNAKE);
  const [food, setFood] = useState({ x: 5, y: 5 });
  const [powerUp, setPowerUp] = useState<PowerUp | null>(null);
  const [activePowerUp, setActivePowerUp] = useState<{ type: PowerUpType; expiry: number } | null>(null);
  const [direction, setDirection] = useState(INITIAL_DIRECTION);
  const [isPaused, setIsPaused] = useState(true);
  const [isGameOver, setIsGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>('MEDIUM');
  const [foodEatenCount, setFoodEatenCount] = useState(0);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const lastUpdateTimeRef = useRef<number>(0);
  const directionRef = useRef(INITIAL_DIRECTION);

  // Load high score and mute state
  useEffect(() => {
    const savedScore = localStorage.getItem('pitonio-highscore') || localStorage.getItem('snake-highscore');
    if (savedScore) setHighScore(parseInt(savedScore, 10));
    
    const savedMute = localStorage.getItem('pitonio-muted') || localStorage.getItem('snake-muted');
    if (savedMute) setIsMuted(savedMute === 'true');

    const savedDiff = localStorage.getItem('pitonio-difficulty') || localStorage.getItem('snake-difficulty');
    if (savedDiff) setDifficulty(savedDiff as Difficulty);
  }, []);

  // Save high score
  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('pitonio-highscore', score.toString());
    }
  }, [score, highScore]);

  // Save mute state and difficulty
  useEffect(() => {
    localStorage.setItem('pitonio-muted', isMuted.toString());
  }, [isMuted]);

  useEffect(() => {
    localStorage.setItem('pitonio-difficulty', difficulty);
  }, [difficulty]);

  const handleResetHighScore = () => {
    localStorage.removeItem('pitonio-highscore');
    localStorage.removeItem('snake-highscore');
    setHighScore(0);
    setShowResetConfirm(false);
  };

  const generatePosition = useCallback((currentSnake: { x: number; y: number }[]) => {
    let pos;
    while (true) {
      pos = {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE),
      };
      const onSnake = currentSnake.some(segment => segment.x === pos.x && segment.y === pos.y);
      if (!onSnake) break;
    }
    return pos;
  }, []);

  const resetGame = () => {
    setSnake(INITIAL_SNAKE);
    setDirection(INITIAL_DIRECTION);
    directionRef.current = INITIAL_DIRECTION;
    setFood(generatePosition(INITIAL_SNAKE));
    setPowerUp(null);
    setActivePowerUp(null);
    setScore(0);
    setFoodEatenCount(0);
    setIsGameOver(false);
    setIsPaused(false);
    setGameStarted(true);
  };

  const moveSnake = useCallback(() => {
    if (isPaused || isGameOver) return;

    // Check power-up expiration
    if (activePowerUp && Date.now() > activePowerUp.expiry) {
      setActivePowerUp(null);
      playSound('expire', isMuted);
    }

    setSnake(prevSnake => {
      const head = prevSnake[0];
      const newHead = {
        x: head.x + directionRef.current.x,
        y: head.y + directionRef.current.y,
      };

      // Collision with walls
      if (
        newHead.x < 0 ||
        newHead.x >= GRID_SIZE ||
        newHead.y < 0 ||
        newHead.y >= GRID_SIZE
      ) {
        setIsGameOver(true);
        playSound('gameover', isMuted);
        return prevSnake;
      }

      // Collision with self (skip if ghost mode)
      if (activePowerUp?.type !== 'GHOST_MODE' && prevSnake.some(segment => segment.x === newHead.x && segment.y === newHead.y)) {
        setIsGameOver(true);
        playSound('gameover', isMuted);
        return prevSnake;
      }

      const newSnake = [newHead, ...prevSnake];

      // Check if food eaten
      if (newHead.x === food.x && newHead.y === food.y) {
        setScore(s => s + 10);
        setFood(generatePosition(newSnake));
        setFoodEatenCount(c => {
          const newCount = c + 1;
          // Spawn power-up every 5 food items
          if (newCount % 5 === 0) {
            const types: PowerUpType[] = ['SPEED_BOOST', 'GHOST_MODE', 'REVERSE_CONTROLS'];
            const type = types[Math.floor(Math.random() * types.length)];
            const pos = generatePosition(newSnake);
            setPowerUp({ ...pos, type });
          }
          return newCount;
        });
        playSound('eat', isMuted);
      } else if (powerUp && newHead.x === powerUp.x && newHead.y === powerUp.y) {
        // Check if power-up collected
        setActivePowerUp({
          type: powerUp.type,
          expiry: Date.now() + POWER_UP_CONFIG[powerUp.type].duration
        });
        setPowerUp(null);
        playSound('powerup', isMuted);
        newSnake.pop();
      } else {
        newSnake.pop();
        playSound('move', isMuted);
      }

      return newSnake;
    });
  }, [food, powerUp, activePowerUp, isPaused, isGameOver, generatePosition, isMuted]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isReversed = activePowerUp?.type === 'REVERSE_CONTROLS';
      
      switch (e.key) {
        case 'ArrowUp':
          if (isReversed) {
            if (directionRef.current.y === 0) directionRef.current = { x: 0, y: 1 };
          } else {
            if (directionRef.current.y === 0) directionRef.current = { x: 0, y: -1 };
          }
          break;
        case 'ArrowDown':
          if (isReversed) {
            if (directionRef.current.y === 0) directionRef.current = { x: 0, y: -1 };
          } else {
            if (directionRef.current.y === 0) directionRef.current = { x: 0, y: 1 };
          }
          break;
        case 'ArrowLeft':
          if (isReversed) {
            if (directionRef.current.x === 0) directionRef.current = { x: 1, y: 0 };
          } else {
            if (directionRef.current.x === 0) directionRef.current = { x: -1, y: 0 };
          }
          break;
        case 'ArrowRight':
          if (isReversed) {
            if (directionRef.current.x === 0) directionRef.current = { x: -1, y: 0 };
          } else {
            if (directionRef.current.x === 0) directionRef.current = { x: 1, y: 0 };
          }
          break;
        case ' ':
          setIsPaused(p => !p);
          break;
        case 'm':
        case 'M':
          setIsMuted(m => !m);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePowerUp]);

  const gameLoop = useCallback((timestamp: number) => {
    if (!lastUpdateTimeRef.current) lastUpdateTimeRef.current = timestamp;
    const elapsed = timestamp - lastUpdateTimeRef.current;

    let speed = DIFFICULTY_CONFIG[difficulty].speed;
    if (activePowerUp?.type === 'SPEED_BOOST') {
      speed = speed * 0.6; // 40% faster
    }

    if (elapsed > speed) {
      moveSnake();
      lastUpdateTimeRef.current = timestamp;
    }

    requestAnimationFrame(gameLoop);
  }, [moveSnake, difficulty, activePowerUp]);

  useEffect(() => {
    const animationId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animationId);
  }, [gameLoop]);

  // Render logic
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cellSize = canvas.width / GRID_SIZE;

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID_SIZE; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cellSize, 0);
      ctx.lineTo(i * cellSize, canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * cellSize);
      ctx.lineTo(canvas.width, i * cellSize);
      ctx.stroke();
    }

    // Draw snake
    snake.forEach((segment, index) => {
      let color = index === 0 ? '#4ade80' : '#22c55e';
      let shadow = '#4ade80';

      if (activePowerUp) {
        color = POWER_UP_CONFIG[activePowerUp.type].color;
        shadow = color;
      }

      ctx.fillStyle = color;
      ctx.shadowBlur = index === 0 ? 15 : 0;
      ctx.shadowColor = shadow;
      
      const x = segment.x * cellSize + 1;
      const y = segment.y * cellSize + 1;
      const size = cellSize - 2;
      const radius = 4;
      
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + size - radius, y);
      ctx.quadraticCurveTo(x + size, y, x + size, y + radius);
      ctx.lineTo(x + size, y + size - radius);
      ctx.quadraticCurveTo(x + size, y + size, x + size - radius, y + size);
      ctx.lineTo(x + radius, y + size);
      ctx.quadraticCurveTo(x, y + size, x, y + size - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
      ctx.fill();
      
      ctx.shadowBlur = 0;
    });

    // Draw food
    ctx.fillStyle = '#ef4444';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#ef4444';
    ctx.beginPath();
    ctx.arc(
      food.x * cellSize + cellSize / 2,
      food.y * cellSize + cellSize / 2,
      cellSize / 2 - 4,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.shadowBlur = 0;

    // Draw power-up
    if (powerUp) {
      const config = POWER_UP_CONFIG[powerUp.type];
      ctx.fillStyle = config.color;
      ctx.shadowBlur = 20;
      ctx.shadowColor = config.color;
      
      const cx = powerUp.x * cellSize + cellSize / 2;
      const cy = powerUp.y * cellSize + cellSize / 2;
      const r = cellSize / 2 - 2;
      
      // Draw a diamond shape for power-ups
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
    }

  }, [snake, food, powerUp, activePowerUp]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-4 font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-6"
      >
        {/* Header */}
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-black tracking-tighter text-emerald-500 italic uppercase">PITONIO.</h1>
            <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Retro Arcade v1.4</p>
          </div>
          <div className="text-right flex flex-col items-end gap-2">
            <button 
              onClick={() => setIsMuted(!isMuted)}
              className="p-2 bg-zinc-900 rounded-lg hover:bg-zinc-800 transition-colors text-zinc-400"
              title={isMuted ? "Unmute (M)" : "Mute (M)"}
            >
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <div className="flex items-center justify-end gap-2 text-zinc-400 text-sm">
              <Trophy size={14} />
              <span className="font-mono">{highScore.toString().padStart(5, '0')}</span>
              <button 
                onClick={() => setShowResetConfirm(true)}
                className="p-1 hover:text-red-500 transition-colors"
                title="Reset High Score"
              >
                <Trash2 size={12} />
              </button>
            </div>
            <div className="text-3xl font-mono font-bold text-white">
              {score.toString().padStart(5, '0')}
            </div>
          </div>
        </div>

        {/* Power-up Status Bar */}
        <div className="h-10 flex items-center justify-center">
          <AnimatePresence mode="wait">
            {activePowerUp && (
              <motion.div
                key={activePowerUp.type}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex items-center gap-3 px-4 py-1.5 rounded-full border"
                style={{ 
                  borderColor: `${POWER_UP_CONFIG[activePowerUp.type].color}44`,
                  backgroundColor: `${POWER_UP_CONFIG[activePowerUp.type].color}11`,
                  color: POWER_UP_CONFIG[activePowerUp.type].color
                }}
              >
                {React.createElement(POWER_UP_CONFIG[activePowerUp.type].icon, { size: 16 })}
                <span className="text-xs font-black tracking-widest uppercase">
                  {POWER_UP_CONFIG[activePowerUp.type].label}
                </span>
                <div className="w-12 h-1 bg-white/10 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-current"
                    initial={{ width: "100%" }}
                    animate={{ width: "0%" }}
                    transition={{ duration: (activePowerUp.expiry - Date.now()) / 1000, ease: "linear" }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Game Area */}
        <div className="relative aspect-square w-full bg-zinc-900 rounded-2xl overflow-hidden border-4 border-zinc-800 shadow-2xl">
          <canvas
            ref={canvasRef}
            width={400}
            height={400}
            className="w-full h-full"
          />

          <AnimatePresence>
            {(!gameStarted || isGameOver || isPaused) && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`absolute inset-0 backdrop-blur-[2px] flex flex-col items-center justify-center p-8 text-center transition-colors duration-500 ${
                  isPaused && !isGameOver && gameStarted ? 'bg-black/50' : 'bg-black/85'
                }`}
              >
                {!gameStarted ? (
                  <div className="space-y-6 w-full">
                    <div className="space-y-2">
                      <h2 className="text-3xl font-bold">SELECT DIFFICULTY</h2>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2">
                      {(['EASY', 'MEDIUM', 'HARD'] as Difficulty[]).map((level) => (
                        <button
                          key={level}
                          onClick={() => setDifficulty(level)}
                          className={`py-2 px-1 text-[10px] font-bold rounded-lg border transition-all ${
                            difficulty === level 
                              ? 'bg-emerald-500 border-emerald-500 text-black' 
                              : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                          }`}
                        >
                          {level}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={resetGame}
                      className="w-full group relative px-8 py-3 bg-emerald-500 text-black font-bold rounded-full hover:bg-emerald-400 transition-all active:scale-95"
                    >
                      <span className="flex items-center justify-center gap-2">
                        <Play size={20} fill="currentColor" />
                        START GAME
                      </span>
                    </button>
                  </div>
                ) : isGameOver ? (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <h2 className="text-4xl font-black text-red-500">GAME OVER</h2>
                      <p className="text-zinc-400">Final Score: {score}</p>
                      <p className="text-zinc-500 text-xs uppercase font-bold tracking-widest">Difficulty: {difficulty}</p>
                    </div>
                    <div className="flex flex-col gap-3">
                      <button
                        onClick={resetGame}
                        className="flex items-center justify-center gap-2 px-8 py-3 bg-white text-black font-bold rounded-full hover:bg-zinc-200 transition-all active:scale-95 mx-auto w-full"
                      >
                        <RotateCcw size={20} />
                        TRY AGAIN
                      </button>
                      <button
                        onClick={() => setGameStarted(false)}
                        className="text-zinc-500 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors"
                      >
                        Change Difficulty
                      </button>
                    </div>
                  </div>
                ) : isPaused ? (
                  <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="space-y-6"
                  >
                    <motion.h2 
                      animate={{ opacity: [1, 0.5, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                      className="text-5xl font-black tracking-tighter text-emerald-500 italic"
                    >
                      PAUSED
                    </motion.h2>
                    <button
                      onClick={() => setIsPaused(false)}
                      className="flex items-center gap-2 px-10 py-4 bg-emerald-500 text-black font-bold rounded-full hover:bg-emerald-400 transition-all active:scale-95 mx-auto shadow-[0_0_20px_rgba(16,185,129,0.4)]"
                    >
                      <Play size={24} fill="currentColor" />
                      RESUME
                    </button>
                    <p className="text-zinc-500 text-[10px] uppercase tracking-[0.2em] font-bold">Press SPACE to continue</p>
                  </motion.div>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Controls (Mobile Friendly) */}
        <div className="grid grid-cols-3 gap-4 max-w-[200px] mx-auto md:hidden">
          <div />
          <button 
            className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center active:bg-zinc-700"
            onClick={() => { if (directionRef.current.y === 0) directionRef.current = { x: 0, y: -1 }; }}
          >
            <ChevronUp />
          </button>
          <div />
          <button 
            className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center active:bg-zinc-700"
            onClick={() => { if (directionRef.current.x === 0) directionRef.current = { x: -1, y: 0 }; }}
          >
            <ChevronLeft />
          </button>
          <button 
            className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center active:bg-zinc-700"
            onClick={() => setIsPaused(p => !p)}
          >
            {isPaused ? <Play size={20} fill="currentColor" /> : <Pause size={20} fill="currentColor" />}
          </button>
          <button 
            className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center active:bg-zinc-700"
            onClick={() => { if (directionRef.current.x === 0) directionRef.current = { x: 1, y: 0 }; }}
          >
            <ChevronRight />
          </button>
          <div />
          <button 
            className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center active:bg-zinc-700"
            onClick={() => { if (directionRef.current.y === 0) directionRef.current = { x: 0, y: 1 }; }}
          >
            <ChevronDown />
          </button>
          <div />
        </div>

        {/* Footer Info */}
        <div className="flex justify-between text-[10px] font-mono text-zinc-600 uppercase tracking-tighter pt-4 border-t border-zinc-900">
          <span>Controls: Arrow Keys / Space / M</span>
          <span>© 2026 AI Studio Build</span>
        </div>
      </motion.div>

      {/* Reset Confirmation Modal */}
      <AnimatePresence>
        {showResetConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl max-w-xs w-full shadow-2xl space-y-6"
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center text-red-500">
                  <AlertTriangle size={24} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-bold">Reset High Score?</h3>
                  <p className="text-sm text-zinc-400">This action cannot be undone. Your current record will be lost forever.</p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={handleResetHighScore}
                  className="w-full py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <Trash2 size={18} />
                  YES, RESET IT
                </button>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <X size={18} />
                  CANCEL
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
