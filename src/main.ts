import './style.css';
import { createGarden } from './garden';
import { mountUI } from './ui';
import type { GardenController } from './types';

const gardenHost = document.querySelector<HTMLElement>('#garden')!;
const uiHost = document.querySelector<HTMLElement>('#ui')!;
let ui: ReturnType<typeof mountUI> | undefined;
let garden: GardenController;
try {
  garden = createGarden(gardenHost, kind => ui?.notify(kind === 'feed' ? '鱼食落下，锦鲤正游向你。' : '水面轻响，锦鲤悄悄游开。'));
} catch (error) {
  console.error('Garden initialization failed:', error);
  gardenHost.classList.add('garden-fallback');
  const note = document.createElement('p');
  note.className = 'webgl-notice';
  note.textContent = '庭院需要 WebGL。请开启浏览器图形加速后刷新；日历与待办仍可使用。';
  gardenHost.append(note);
  garden = { setView() {}, setWeather() {}, feed() {}, startle() {}, setPaused() {}, dispose() {}, getDebugState: () => ({ fallback: true }) };
}
ui = mountUI(uiHost, garden);
const loading = document.querySelector('#loading');
requestAnimationFrame(() => { loading?.classList.add('loaded'); setTimeout(() => loading?.remove(), 1000); });
const visibility = () => garden.setPaused(document.hidden);
document.addEventListener('visibilitychange', visibility);
visibility();
// A read-only diagnostic is useful for reproducible rendering/interaction checks.
Object.defineProperty(window, '__zelender', { value: { getState: () => garden.getDebugState() }, configurable: true });
if (import.meta.hot) import.meta.hot.dispose(() => {
  ui?.dispose(); garden.dispose(); document.removeEventListener('visibilitychange', visibility);
});
