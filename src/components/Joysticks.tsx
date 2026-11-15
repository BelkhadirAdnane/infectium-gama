import { useEffect, useRef, useState } from 'react';

interface JoystickProps {
  side: 'left' | 'right';
  size: number;
  opacity: number;
  label: string;
  /** x : droite +, y : haut (avant) +, valeurs −1..1. */
  onChange: (x: number, y: number) => void;
}

function Joystick({ side, size, opacity, label, onChange }: JoystickProps) {
  const baseRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => () => onChangeRef.current(0, 0), []);

  const update = (clientX: number, clientY: number) => {
    const el = baseRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const max = rect.width * 0.36;
    let dx = clientX - (rect.left + rect.width / 2);
    let dy = clientY - (rect.top + rect.height / 2);
    const r = Math.hypot(dx, dy);
    if (r > max) {
      dx = (dx * max) / r;
      dy = (dy * max) / r;
    }
    setKnob({ x: dx, y: dy });
    let nx = dx / max;
    let ny = -dy / max;
    if (Math.hypot(nx, ny) < 0.12) {
      nx = 0;
      ny = 0;
    }
    onChangeRef.current(nx, ny);
  };

  const release = () => {
    pointer.current = null;
    setKnob({ x: 0, y: 0 });
    onChangeRef.current(0, 0);
  };

  return (
    <div
      className={`joystick joystick-${side}`}
      style={{ width: size, height: size, opacity }}
      onPointerDown={(e) => {
        pointer.current = e.pointerId;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (pointer.current === e.pointerId) update(e.clientX, e.clientY);
      }}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div className="joystick-base" ref={baseRef}>
        <span className="joystick-label">{label}</span>
        <div className="joystick-knob" style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }} />
      </div>
    </div>
  );
}

interface Props {
  size: number;
  opacity: number;
  onMove: (x: number, y: number) => void;
  onLook: (x: number, y: number) => void;
}

export default function Joysticks({ size, opacity, onMove, onLook }: Props) {
  return (
    <>
      <Joystick side="left" size={size} opacity={opacity} label="MARCHER" onChange={onMove} />
      <Joystick side="right" size={size} opacity={opacity} label="REGARDER" onChange={onLook} />
    </>
  );
}
