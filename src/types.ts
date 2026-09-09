export type Weather = 'sunny' | 'rain' | 'snow' | 'mist';
export type ViewMode = 'room' | 'pond';
export interface GardenController {
  setView(view: ViewMode): void;
  setWeather(weather: Weather): void;
  feed(): void;
  startle(): void;
  setPaused(paused: boolean): void;
  dispose(): void;
  getDebugState(): Record<string, unknown>;
}
export interface Settings {
  view: ViewMode;
  weather: Weather;
  sidebarOpacity: number;
  sound: boolean;
}
