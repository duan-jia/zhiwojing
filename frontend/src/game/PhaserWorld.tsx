import {useEffect, useRef} from 'react';
import Phaser from 'phaser';
import {WorldScene} from './WorldScene';

export function PhaserWorld() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      backgroundColor: '#746e5d',
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: '100%',
        height: '100%',
      },
      render: {
        antialias: true,
        pixelArt: false,
        roundPixels: true,
      },
      scene: [WorldScene],
    });

    return () => game.destroy(true);
  }, []);

  return <div ref={hostRef} className="phaser-world" aria-label="可行走的菱形格子地图"/>;
}
