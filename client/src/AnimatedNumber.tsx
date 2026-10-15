import { useEffect, useRef, useState } from "react";

// Shows a number that counts to its new value and flashes green (up) or red (down) when it changes
export default function AnimatedNumber({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const [flash, setFlash] = useState("");
  const previous = useRef(value);

  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (from === value) return;

    setFlash(value > from ? "flash-up" : "flash-down");
    let frame = 0;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
    } else {
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / 600);
        setShown(Math.round(from + (value - from) * (1 - Math.pow(1 - t, 3))));
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }
    const timer = setTimeout(() => setFlash(""), 900);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [value]);

  return <span className={flash}>{shown.toLocaleString()}</span>;
}