import {useState} from 'react';
import {PhaserWorld} from './game/PhaserWorld';

export function MapDemo() {
  const [worldKey, setWorldKey] = useState(0);

  return <main className="map-demo">
    <PhaserWorld key={worldKey}/>
    <header className="map-hud">
      <div>
        <span className="map-hud__eyebrow">ISOMETRIC WALKING DEMO</span>
        <h1>晴野漫游</h1>
      </div>
      <button type="button" onClick={() => setWorldKey(key => key + 1)}>换一张地图</button>
    </header>
    <aside className="control-hint" aria-label="操作说明">
      <div><kbd>WASD</kbd><span>或方向键行走</span></div>
      <div><kbd>滚轮</kbd><span>缩放地图</span></div>
    </aside>
    <div className="map-note">水域、树木和石头不可穿越</div>
  </main>;
}
