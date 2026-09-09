import type { GardenController, ViewMode, Weather } from './types';
import { createAmbience } from './scene/ambience';
import { applyTodoChanges, calendarDays, dateKey, loadSettings, loadTodos, readTodos, saveSettings, saveTodos, SETTINGS_KEY, TODO_KEY, type Todo, type TodoChange } from './model';

const paths = {
  arrowLeft: '<path d="m14 6-6 6 6 6"/>',
  arrowRight: '<path d="m10 6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  room: '<path d="M4 20V4h16v16M4 7h16M9 7v13M15 7v13M2 20h20"/>',
  pond: '<ellipse cx="12" cy="12" rx="9" ry="6.5"/><path d="M8 12c2-2 4-2 6 0-2 2-4 2-6 0Zm6 0 2-2v4l-2-2"/>',
  feed: '<path d="M3 16c3-3 6-3 9 0-3 3-6 3-9 0Zm9 0 4-3v6l-4-3M16 4v2M20 8v2M12 7v2"/>',
  sunny: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>',
  rain: '<path d="M6 14a4 4 0 1 1 .5-8A5.5 5.5 0 0 1 17 7a3.5 3.5 0 0 1 .5 7M7 17l-1 3M12 16l-1 3M17 17l-1 3"/>',
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9 4.5l3 3 3-3M9 19.5l3-3 3 3M4 11l4-1-1-4M20 13l-4 1 1 4M7 18l1-4-4-1M17 6l-1 4 4 1"/>',
  mist: '<path d="M5 6h14M3 10h13M8 14h13M4 18h14"/>',
  focus: '<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/>',
  sound: '<path d="m11 5-5 4H3v6h3l5 4V5ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 5-5 4H3v6h3l5 4V5ZM16 9l6 6M16 15l6-6"/>',
  settings: '<path d="M4 7h6M14 7h6M4 17h10M18 17h2"/><circle cx="12" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>',
  calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 10h16M8 14h2M14 14h2M8 17h2"/>',
  leaf: '<path d="M18 4C8 3 3 8 6 15c6 6 14 0 12-11ZM5 20 15 9M8 16v-5M12 12h4"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
  lock: '<rect x="6" y="10" width="12" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2"/>',
} as const;
type IconName = keyof typeof paths;

function icon(name: IconName, className = ''): string {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

const weatherOptions: { value: Weather; name: string; description: string }[] = [
  { value: 'sunny', name: '晴日', description: '光穿过树梢' },
  { value: 'rain', name: '听雨', description: '雨落一池涟漪' },
  { value: 'snow', name: '初雪', description: '庭院轻轻落白' },
  { value: 'mist', name: '薄雾', description: '轻烟浮过水面' },
];

export function mountUI(host: HTMLElement, garden: GardenController): { dispose(): void; notify(message: string): void } {
  const settings = loadSettings();
  let todos = loadTodos();
  let pendingTodoChanges: TodoChange[] = [];
  let selected = new Date();
  selected.setHours(12, 0, 0, 0);
  let year = selected.getFullYear();
  let month = selected.getMonth();
  let focused = false;
  let organizerOpen = true;
  let soundOn = false;
  let disposed = false;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const cleanup = new AbortController();
  const ambience = createAmbience();
  const root = document.createElement('div');
  root.className = 'ui-root';
  // The template contains static application copy only; all todo content uses textContent.
  root.innerHTML = `
    <section class="garden-intro" aria-label="庭院介绍">
      <h1>一池清和</h1>
      <p>白砂绕池，树影入水。</p>
    </section>
    <header class="garden-header">
      <section class="clock-section" aria-label="当前时间">
        <time class="clock-time"></time>
        <p class="clock-date"></p>
      </section>
      <button class="organizer-toggle icon-button" type="button" aria-label="收起日历和待办" aria-expanded="true" aria-controls="organizer" title="日历与待办">${icon('calendar')}</button>
    </header>
    <aside class="organizer glass" id="organizer" aria-label="日历和待办">
      <div class="organizer-heading"><span class="organizer-title">日常</span><button class="organizer-close icon-button" type="button" aria-label="收起日历和待办">${icon('close')}</button></div>
      <section class="calendar-section" aria-label="日历">
        <div class="calendar-heading">
          <h2 class="calendar-month" aria-live="polite"></h2>
          <div class="calendar-navigation"><button class="calendar-previous icon-button" type="button" aria-label="上个月">${icon('arrowLeft')}</button><button class="calendar-next icon-button" type="button" aria-label="下个月">${icon('arrowRight')}</button></div>
        </div>
        <div class="calendar-weekdays" aria-hidden="true"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>
        <div class="calendar-grid" role="group" aria-label="日历日期，可用方向键选择"></div>
        <button class="today-link" type="button">回到今天</button>
      </section>
      <section class="todo-section" aria-label="选中日期的待办事项">
        <div class="todo-heading"><h2>待办</h2><span class="todo-count"></span></div>
        <p class="selected-date"></p>
        <div class="todo-scroll"><ul class="todo-list"></ul><div class="todo-empty">${icon('leaf')}<p class="empty-title"></p><span>记下一件想完成的小事。</span></div></div>
        <form class="todo-form"><label class="sr-only" for="new-todo">添加待办事项</label><input id="new-todo" name="todo" type="text" autocomplete="off" maxlength="240" placeholder="添加一件小事…" required><button class="todo-add icon-button" type="submit" aria-label="添加待办" disabled>${icon('plus')}</button></form>
      </section>
      <p class="storage-note">${icon('lock')}<span>保存在此浏览器</span></p>
    </aside>
    <nav class="garden-toolbar" aria-label="庭院控制">
      <div class="view-switch" role="group" aria-label="选择视角"><button class="view-button" type="button" data-view="room" aria-pressed="true">${icon('room')}<span>庭前</span></button><button class="view-button" type="button" data-view="pond" aria-pressed="false">${icon('pond')}<span>池畔</span></button></div>
      <span class="toolbar-divider" aria-hidden="true"></span>
      <button class="weather-toggle toolbar-button" type="button" aria-label="改变天气" aria-expanded="false" aria-controls="weather-popover"><span class="weather-icon"></span><span class="weather-label"></span></button>
      <button class="feed-button toolbar-button" type="button" aria-label="投喂锦鲤">${icon('feed')}<span>投喂</span></button>
      <button class="settings-toggle toolbar-button icon-only" type="button" aria-label="设置与新标签页安装" aria-expanded="false" aria-controls="settings-popover" title="设置">${icon('settings')}</button>
    </nav>
    <div class="garden-caption">
      <p class="garden-caption-line">留一点时间，看鱼游过。</p>
      <p class="garden-caption-help"><span class="pointer-hint">右键投喂 · 左键惊鱼 · 点击风铃</span><span class="touch-hint">轻触水面惊鱼 · 轻触风铃听声</span></p>
    </div>
    <button class="focus-exit icon-button" type="button" aria-label="退出静观，显示界面，快捷键 H" title="显示界面 (H)" hidden>${icon('focus')}</button>
    <section class="weather-popover popover glass" id="weather-popover" aria-label="选择天气" hidden><p class="popover-heading">庭院里的天气</p><div class="weather-options" role="group" aria-label="天气"></div><p class="popover-footnote">随心切换，不代表当地天气</p></section>
    <section class="settings-popover popover glass" id="settings-popover" role="dialog" aria-labelledby="settings-title" hidden>
      <div class="settings-heading"><h2 id="settings-title">庭院设置</h2><button class="settings-close icon-button" type="button" aria-label="关闭设置">${icon('close')}</button></div>
      <div class="settings-actions">
        <button class="sound-toggle settings-action" type="button" aria-label="开启庭院声音" aria-pressed="false">${icon('mute')}<span>庭院声音</span><span class="setting-state">已关闭</span></button>
        <button class="focus-toggle settings-action" type="button" aria-label="进入静观，隐藏界面" aria-pressed="false">${icon('focus')}<span>静观</span><span class="setting-state">隐藏界面</span></button>
      </div>
      <label class="opacity-label" for="sidebar-opacity">侧栏透明度<output for="sidebar-opacity" class="opacity-value"></output></label>
      <input class="opacity-slider" id="sidebar-opacity" type="range" min="15" max="85" step="1">
      <div class="slider-labels"><span>清晰</span><span>通透</span></div>
      <div class="install-guide"><h3>把庭院设为新标签页</h3><p>每次打开 Chrome，都回到这一方安静。</p><a class="download-extension" href="./zelender-extension.zip" download>${icon('download')}<span>下载 Chrome 扩展</span></a><ol><li>下载后，解压 ZIP 文件。</li><li>打开 <code>chrome://extensions</code>，开启「开发者模式」。</li><li>选择「加载已解压的扩展程序」，选中解压后的文件夹。</li></ol></div>
      <p class="settings-note">待办仅存于当前浏览器，不会上传。网页与扩展的数据各自保存。</p>
      <p class="interaction-guide"><span class="pointer-hint">右键水面投喂 · 左键水面惊鱼</span><span class="touch-hint">轻触水面惊鱼，用下方按钮投喂</span><br>点击木廊上的风铃，听一声清响。</p>
      <p class="keyboard-hint"><kbd>1</kbd> 庭前 <kbd>2</kbd> 池畔 <kbd>F</kbd> 投喂 <kbd>H</kbd> 隐藏界面 <kbd>Esc</kbd> 收起面板</p>
    </section>
    <div class="toast glass" role="status" aria-live="polite" aria-atomic="true" hidden></div>
  `;
  host.append(root);

  const find = <T extends HTMLElement>(selector: string): T => {
    const result = root.querySelector<T>(selector);
    if (!result) throw new Error(`Missing UI element: ${selector}`);
    return result;
  };
  const organizer = find<HTMLElement>('.organizer');
  const grid = find<HTMLDivElement>('.calendar-grid');
  const todoList = find<HTMLUListElement>('.todo-list');
  const todoInput = find<HTMLInputElement>('#new-todo');
  const todoAdd = find<HTMLButtonElement>('.todo-add');
  const weatherPopover = find<HTMLElement>('.weather-popover');
  const weatherToggle = find<HTMLButtonElement>('.weather-toggle');
  const settingsPopover = find<HTMLElement>('.settings-popover');
  const settingsToggle = find<HTMLButtonElement>('.settings-toggle');
  const organizerToggle = find<HTMLButtonElement>('.organizer-toggle');
  const focusExit = find<HTMLButtonElement>('.focus-exit');
  const soundToggle = find<HTMLButtonElement>('.sound-toggle');
  const opacitySlider = find<HTMLInputElement>('.opacity-slider');
  const toast = find<HTMLDivElement>('.toast');

  function notify(message: string) {
    if (disposed) return;
    clearTimeout(toastTimer);
    toast.hidden = false;
    toast.textContent = message;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3800);
  }

  function persistSettings() {
    if (!saveSettings(settings)) notify('浏览器暂时无法保存设置；本次调整仍然有效。');
  }

  function persistTodos(change: TodoChange) {
    pendingTodoChanges.push(change);
    todos = applyTodoChanges(readTodos() ?? todos, pendingTodoChanges);
    const saved = saveTodos(todos);
    if (saved) pendingTodoChanges = [];
    find<HTMLElement>('.storage-note span').textContent = saved ? '保存在此浏览器' : '尚未保存，请保留此页';
    if (!saved) notify('待办暂时无法保存，请保留此页并检查浏览器存储设置。');
    renderCalendar();
    renderTodos();
  }

  function setOrganizerVisibility() {
    const visible = !focused && organizerOpen;
    organizer.hidden = !visible;
    root.classList.toggle('is-focus', focused);
    root.classList.toggle('is-organizer-open', visible);
    organizerToggle.setAttribute('aria-expanded', String(visible));
    organizerToggle.setAttribute('aria-label', visible ? '收起日历和待办' : '打开日历和待办');
    focusExit.hidden = !focused;
    const focusToggle = find<HTMLButtonElement>('.focus-toggle');
    focusToggle.setAttribute('aria-pressed', String(focused));
    focusToggle.setAttribute('aria-label', focused ? '退出静观，显示界面' : '进入静观，隐藏界面');
  }

  function closePopovers(returnFocus = false) {
    const previous = !settingsPopover.hidden ? settingsToggle : !weatherPopover.hidden ? weatherToggle : undefined;
    settingsPopover.hidden = true;
    weatherPopover.hidden = true;
    settingsToggle.setAttribute('aria-expanded', 'false');
    weatherToggle.setAttribute('aria-expanded', 'false');
    if (returnFocus) previous?.focus();
  }

  function setFocusMode(active: boolean) {
    focused = active;
    closePopovers();
    setOrganizerVisibility();
    if (focused) focusExit.focus();
    else settingsToggle.focus();
  }

  function chooseView(view: ViewMode) {
    settings.view = view;
    garden.setView(view);
    root.dataset.view = view;
    root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.view === view));
    });
    persistSettings();
  }

  function renderWeather() {
    const current = weatherOptions.find(option => option.value === settings.weather)!;
    find<HTMLElement>('.weather-label').textContent = current.name;
    find<HTMLElement>('.weather-icon').innerHTML = icon(current.value);
    weatherToggle.setAttribute('aria-label', `改变天气，当前${current.name}`);
    root.querySelectorAll<HTMLButtonElement>('[data-weather]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.weather === current.value));
    });
  }

  function chooseWeather(weather: Weather) {
    settings.weather = weather;
    garden.setWeather(weather);
    renderWeather();
    persistSettings();
    if (soundOn && !document.hidden) void ambience.play(weather).catch(handleAudioError);
  }

  function selectDate(date: Date, focusDate = false) {
    selected = date;
    year = date.getFullYear();
    month = date.getMonth();
    renderCalendar();
    renderTodos();
    if (focusDate) grid.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
  }

  function renderCalendar() {
    const title = find<HTMLElement>('.calendar-month');
    title.replaceChildren();
    const monthLabel = document.createElement('span');
    monthLabel.textContent = `${month + 1} 月`;
    const yearLabel = document.createElement('span');
    yearLabel.className = 'calendar-year';
    yearLabel.textContent = `${year}`;
    title.append(monthLabel, yearLabel);
    const today = dateKey(new Date());
    const selectedKey = dateKey(selected);
    const datesWithTodos = new Set(todos.filter(todo => !todo.done).map(todo => todo.date));
    grid.replaceChildren(...calendarDays(year, month).map(date => {
      const key = dateKey(date);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'calendar-day';
      button.textContent = String(date.getDate());
      button.dataset.date = key;
      button.classList.toggle('outside-month', date.getMonth() !== month);
      button.classList.toggle('has-todos', datesWithTodos.has(key));
      button.setAttribute('aria-label', `${date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}${datesWithTodos.has(key) ? '，有未完成待办' : ''}`);
      button.setAttribute('aria-pressed', String(key === selectedKey));
      if (key === today) button.setAttribute('aria-current', 'date');
      button.tabIndex = key === selectedKey ? 0 : -1;
      button.addEventListener('click', () => selectDate(date, true));
      return button;
    }));
    // Month navigation can put the selected day outside the visible grid.
    if (!grid.querySelector('[tabindex="0"]')) {
      const first = grid.querySelector<HTMLButtonElement>('.calendar-day:not(.outside-month)');
      if (first) first.tabIndex = 0;
    }
    find<HTMLButtonElement>('.today-link').classList.toggle('is-current', today === selectedKey && year === selected.getFullYear() && month === selected.getMonth());
  }

  function renderTodos() {
    const key = dateKey(selected);
    const dailyTodos = todos.filter(todo => todo.date === key);
    const remaining = dailyTodos.filter(todo => !todo.done).length;
    const isToday = key === dateKey(new Date());
    find<HTMLElement>('.selected-date').textContent = `${isToday ? '今天 · ' : ''}${selected.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}`;
    find<HTMLElement>('.todo-count').textContent = dailyTodos.length ? `${remaining} 项待完成` : '从容开始';
    find<HTMLElement>('.todo-empty').hidden = dailyTodos.length > 0;
    find<HTMLElement>('.empty-title').textContent = isToday ? '今日留白' : '这一天，尚有留白';
    todoList.replaceChildren(...dailyTodos.map(todo => {
      const li = document.createElement('li');
      li.className = `todo-item${todo.done ? ' is-done' : ''}`;
      const label = document.createElement('label');
      label.className = 'todo-label';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = todo.done;
      checkbox.dataset.todoId = todo.id;
      const checkmark = document.createElement('span');
      checkmark.className = 'todo-checkmark';
      checkmark.innerHTML = icon('check');
      const text = document.createElement('span');
      text.className = 'todo-text';
      text.textContent = todo.text;
      label.append(checkbox, checkmark, text);
      checkbox.addEventListener('change', () => {
        persistTodos({ type: 'set-done', id: todo.id, done: checkbox.checked });
        Array.from(todoList.querySelectorAll<HTMLInputElement>('input')).find(input => input.dataset.todoId === todo.id)?.focus();
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'todo-remove icon-button';
      remove.setAttribute('aria-label', `删除待办：${todo.text}`);
      remove.innerHTML = icon('close');
      remove.addEventListener('click', () => {
        const index = dailyTodos.indexOf(todo);
        persistTodos({ type: 'remove', id: todo.id });
        const removers = todoList.querySelectorAll<HTMLButtonElement>('.todo-remove');
        if (removers.length) removers[Math.min(index, removers.length - 1)].focus();
        else todoInput.focus();
      });
      li.append(label, remove);
      return li;
    }));
  }

  let lastDate = '';
  function renderClock() {
    const now = new Date();
    const time = find<HTMLTimeElement>('.clock-time');
    time.dateTime = now.toISOString();
    time.textContent = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
    find<HTMLElement>('.clock-date').textContent = now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
    if (lastDate && lastDate !== dateKey(now)) {
      renderCalendar();
      renderTodos();
    }
    lastDate = dateKey(now);
  }

  function renderOpacity() {
    root.style.setProperty('--sidebar-opacity', String(settings.sidebarOpacity));
    opacitySlider.value = String(Math.round((1 - settings.sidebarOpacity) * 100));
    find<HTMLOutputElement>('.opacity-value').value = `${opacitySlider.value}%`;
  }

  function renderSound() {
    soundToggle.innerHTML = `${icon(soundOn ? 'sound' : 'mute')}<span>庭院声音</span><span class="setting-state">${soundOn ? '随天气变化' : '已关闭'}</span>`;
    soundToggle.setAttribute('aria-pressed', String(soundOn));
    soundToggle.setAttribute('aria-label', soundOn ? '关闭庭院声音' : '开启庭院声音');
    soundToggle.title = soundOn ? '关闭庭院声音' : '开启庭院声音';
  }

  function handleAudioError() {
    if (disposed) return;
    soundOn = false;
    settings.sound = false;
    renderSound();
    persistSettings();
    notify('庭院声音暂时无法播放，可以继续欣赏庭院。');
  }

  weatherOptions.forEach(option => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'weather-option';
    button.dataset.weather = option.value;
    button.innerHTML = `${icon(option.value)}<span class="weather-option-name">${option.name}</span><span class="weather-description">${option.description}</span>`;
    button.addEventListener('click', () => { chooseWeather(option.value); closePopovers(true); });
    find<HTMLElement>('.weather-options').append(button);
  });

  root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => {
    button.addEventListener('click', () => chooseView(button.dataset.view as ViewMode));
  });
  find<HTMLButtonElement>('.calendar-previous').addEventListener('click', () => {
    const previous = new Date(year, month - 1, 1, 12);
    year = previous.getFullYear(); month = previous.getMonth(); renderCalendar();
  });
  find<HTMLButtonElement>('.calendar-next').addEventListener('click', () => {
    const next = new Date(year, month + 1, 1, 12);
    year = next.getFullYear(); month = next.getMonth(); renderCalendar();
  });
  find<HTMLButtonElement>('.today-link').addEventListener('click', () => {
    const today = new Date(); today.setHours(12, 0, 0, 0); selectDate(today);
  });
  grid.addEventListener('keydown', event => {
    const button = event.target;
    if (!(button instanceof HTMLButtonElement) || !button.dataset.date) return;
    const [y, m, d] = button.dataset.date.split('-').map(Number);
    const date = new Date(y, m - 1, d, 12);
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -((date.getDay() + 6) % 7), End: 6 - ((date.getDay() + 6) % 7) };
    if (event.key in offsets) {
      event.preventDefault(); date.setDate(date.getDate() + offsets[event.key]); selectDate(date, true);
    } else if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault();
      const nextMonth = m - 1 + (event.key === 'PageUp' ? -1 : 1);
      selectDate(new Date(y, nextMonth, Math.min(d, new Date(y, nextMonth + 1, 0).getDate()), 12), true);
    }
  });
  todoInput.addEventListener('input', () => { todoAdd.disabled = !todoInput.value.trim(); });
  find<HTMLFormElement>('.todo-form').addEventListener('submit', event => {
    event.preventDefault();
    const text = todoInput.value.trim();
    if (!text) return;
    const todo: Todo = { id: crypto.randomUUID(), text, date: dateKey(selected), done: false };
    todoInput.value = ''; todoAdd.disabled = true;
    persistTodos({ type: 'add', todo }); todoInput.focus();
    find<HTMLElement>('.todo-scroll').scrollTo({ top: find<HTMLElement>('.todo-scroll').scrollHeight });
  });
  find<HTMLButtonElement>('.feed-button').addEventListener('click', () => garden.feed());
  find<HTMLButtonElement>('.focus-toggle').addEventListener('click', () => setFocusMode(!focused));
  focusExit.addEventListener('click', () => setFocusMode(false));
  organizerToggle.addEventListener('click', () => {
    organizerOpen = organizer.hidden;
    focused = false;
    closePopovers(); setOrganizerVisibility();
    if (organizerOpen) grid.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus();
  });
  find<HTMLButtonElement>('.organizer-close').addEventListener('click', () => {
    organizerOpen = false; setOrganizerVisibility(); organizerToggle.focus();
  });
  weatherToggle.addEventListener('click', () => {
    const opening = weatherPopover.hidden;
    closePopovers(); weatherPopover.hidden = !opening;
    weatherToggle.setAttribute('aria-expanded', String(opening));
    if (opening) weatherPopover.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
  });
  settingsToggle.addEventListener('click', () => {
    const opening = settingsPopover.hidden;
    if (opening) { organizerOpen = false; setOrganizerVisibility(); }
    closePopovers(); settingsPopover.hidden = !opening;
    settingsToggle.setAttribute('aria-expanded', String(opening));
    if (opening) find<HTMLButtonElement>('.settings-close').focus();
  });
  find<HTMLButtonElement>('.settings-close').addEventListener('click', () => closePopovers(true));
  opacitySlider.addEventListener('input', () => {
    settings.sidebarOpacity = (100 - Number(opacitySlider.value)) / 100; renderOpacity();
  });
  opacitySlider.addEventListener('change', persistSettings);
  soundToggle.addEventListener('click', async () => {
    soundOn = !soundOn;
    settings.sound = soundOn;
    renderSound(); persistSettings();
    try { if (soundOn && !document.hidden) await ambience.play(settings.weather); else await ambience.pause(); }
    catch { handleAudioError(); }
  });

  if (location.protocol === 'chrome-extension:') {
    const install = find<HTMLElement>('.install-guide');
    install.innerHTML = `<h3>庭院已是你的新标签页</h3><p>打开一个新标签，就能回来坐一会儿。</p>`;
  }

  document.addEventListener('pointerdown', event => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (!weatherPopover.contains(target) && !settingsPopover.contains(target) && !weatherToggle.contains(target) && !settingsToggle.contains(target)) closePopovers();
  }, { signal: cleanup.signal });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape') {
      if (!settingsPopover.hidden || !weatherPopover.hidden) { closePopovers(true); return; }
      if (!organizer.hidden) { organizerOpen = false; setOrganizerVisibility(); organizerToggle.focus(); }
      else if (focused) setFocusMode(false);
      return;
    }
    if (event.repeat) return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('input,textarea,select,[contenteditable="true"]')) return;
    if (event.key.toLowerCase() === 'h') { event.preventDefault(); setFocusMode(!focused); return; }
    if (!settingsPopover.hidden) return;
    if (event.key === '1') chooseView('room');
    if (event.key === '2') chooseView('pond');
    if (event.key.toLowerCase() === 'f') garden.feed();
  }, { signal: cleanup.signal });
  document.addEventListener('visibilitychange', () => {
    if (!soundOn) return;
    if (document.hidden) void ambience.pause().catch(handleAudioError);
    else void ambience.play(settings.weather).catch(handleAudioError);
  }, { signal: cleanup.signal });
  window.addEventListener('storage', event => {
    if (event.key === TODO_KEY || event.key === null) {
      const latest = readTodos();
      if (latest !== null) todos = applyTodoChanges(latest, pendingTodoChanges);
      renderCalendar(); renderTodos();
    }
    if (event.key === SETTINGS_KEY || event.key === null) {
      Object.assign(settings, loadSettings());
      garden.setView(settings.view);
      garden.setWeather(settings.weather);
      root.dataset.view = settings.view;
      root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === settings.view)));
      renderWeather(); renderOpacity();
      if (soundOn && !settings.sound) {
        soundOn = false; renderSound(); void ambience.pause().catch(handleAudioError);
      } else if (soundOn && !document.hidden) {
        void ambience.play(settings.weather).catch(handleAudioError);
      }
    }
  }, { signal: cleanup.signal });

  // Keep the organizer form inside the visible area when a mobile keyboard opens.
  function resizeVisibleArea() {
    root.style.setProperty('--visible-height', `${window.visualViewport?.height ?? window.innerHeight}px`);
    if (document.activeElement === todoInput) todoInput.scrollIntoView({ block: 'nearest' });
  }
  window.visualViewport?.addEventListener('resize', resizeVisibleArea, { signal: cleanup.signal });
  resizeVisibleArea();

  garden.setView(settings.view);
  garden.setWeather(settings.weather);
  root.dataset.view = settings.view;
  root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === settings.view)));
  renderClock(); renderCalendar(); renderTodos(); renderWeather(); renderOpacity(); setOrganizerVisibility();
  const clockInterval = setInterval(renderClock, 1000);

  return {
    notify,
    dispose() {
      disposed = true; cleanup.abort(); clearInterval(clockInterval); clearTimeout(toastTimer); void ambience.dispose(); root.remove();
    },
  };
}
