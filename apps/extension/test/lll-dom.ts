/**
 * jsdom model of the live Tiny Lesson page (verified 2026-10-22/23): a react-select language picker
 * (`lll-select__*` classes, `[role=combobox]` input, `[role=option]` DIVs in a `[role=listbox]` menu that
 * opens on mousedown on the control), the purpose input (no form, no type, no maxLength, React-controlled)
 * and a Generate button that React enables once a language is chosen and the purpose is not empty.
 */
export const LLL_OPTIONS = ['Arabic', 'English (US)', 'French (France)', 'Japanese', 'Spanish (Spain)', 'Turkish'];

export interface TinyLessonDom {
  combo: HTMLInputElement;
  control: HTMLDivElement;
  purpose: HTMLInputElement;
  generate: HTMLButtonElement;
  /** Values React saw through input events (the prototype-setter path). */
  reactPurpose: string[];
  /** Language label currently shown in the control ('' = none). */
  language: () => string;
  generated: string[];
  menuOpens: () => number;
}

export function mountTinyLesson(
  opts: { language?: string; options?: string[]; enableDelayMs?: number; neverEnable?: boolean } = {},
): TinyLessonDom {
  const doc = document;
  const options = opts.options ?? LLL_OPTIONS;
  let language = opts.language ?? '';
  let purposeState = '';
  let opens = 0;
  const generated: string[] = [];

  const root = doc.createElement('main');
  const select = doc.createElement('div');
  select.className = 'lll-select-container';
  const control = doc.createElement('div');
  control.className = 'lll-select__control';
  const valueBox = doc.createElement('div');
  valueBox.className = 'lll-select__value-container';
  const single = doc.createElement('div');
  single.className = 'lll-select__single-value';
  const placeholder = doc.createElement('div');
  placeholder.className = 'lll-select__placeholder';
  placeholder.textContent = 'Select...';
  const inputBox = doc.createElement('div');
  inputBox.className = 'lll-select__input-container';
  const combo = doc.createElement('input');
  combo.setAttribute('role', 'combobox');
  combo.setAttribute('aria-label', 'Select Language');
  combo.setAttribute('aria-expanded', 'false');
  inputBox.append(combo);
  valueBox.append(language ? single : placeholder, inputBox);
  control.append(valueBox);
  select.append(control);

  const renderValue = () => {
    single.textContent = language;
    valueBox.replaceChildren(language ? single : placeholder, inputBox);
  };
  renderValue();

  let menu: HTMLDivElement | null = null;
  const closeMenu = () => {
    menu?.remove();
    menu = null;
    combo.setAttribute('aria-expanded', 'false');
  };
  control.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (menu) return closeMenu();
    opens++;
    menu = doc.createElement('div');
    menu.className = 'lll-select__menu';
    const list = doc.createElement('div');
    list.setAttribute('role', 'listbox');
    list.className = 'lll-select__menu-list';
    for (const label of options) {
      const o = doc.createElement('div');
      o.setAttribute('role', 'option');
      o.className = 'lll-select__option';
      o.textContent = label;
      o.addEventListener('click', () => {
        language = label;
        renderValue();
        closeMenu();
        update();
      });
      list.append(o);
    }
    menu.append(list);
    // react-select renders the menu asynchronously after the state update
    setTimeout(() => {
      if (menu) select.append(menu);
      combo.setAttribute('aria-expanded', 'true');
    }, 5);
  });

  const purposeWrap = doc.createElement('div');
  const purpose = doc.createElement('input');
  purpose.placeholder = 'going on a first date';
  const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
  let tracked = '';
  Object.defineProperty(purpose, 'value', {
    configurable: true,
    get() {
      return native.get!.call(this);
    },
    set(v: string) {
      tracked = String(v);
      native.set!.call(this, v);
    },
  });
  const reactPurpose: string[] = [];
  purpose.addEventListener('input', () => {
    const current = native.get!.call(purpose) as string;
    if (current !== tracked) {
      tracked = current;
      purposeState = current;
      reactPurpose.push(current);
      update();
    }
  });
  purposeWrap.append(purpose);

  const generate = doc.createElement('button');
  generate.type = 'button';
  generate.textContent = 'Generate';
  generate.disabled = true;
  generate.addEventListener('click', () => {
    if (!generate.disabled) generated.push(`${language}|${purposeState}`);
  });

  function update() {
    const ready = !opts.neverEnable && language !== '' && purposeState.trim() !== '';
    if (!ready) {
      generate.disabled = true;
      return;
    }
    if (opts.enableDelayMs) setTimeout(() => (generate.disabled = false), opts.enableDelayMs);
    else generate.disabled = false;
  }

  root.append(select, purposeWrap, generate);
  doc.body.append(root);
  return {
    combo,
    control,
    purpose,
    generate,
    reactPurpose,
    language: () => language,
    generated,
    menuOpens: () => opens,
  };
}

/** First visit: intro splash with a "Start" link to the site home. */
export function mountSplash(): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = '/lll/en';
  a.textContent = 'Start';
  const h = document.createElement('h1');
  h.textContent = 'Tiny Lesson';
  document.body.append(h, a);
  return a;
}

/** "Before you begin" notice: checkbox "I understand" + Continue. */
export function mountBeforeYouBegin(): void {
  const label = document.createElement('label');
  const box = document.createElement('input');
  box.type = 'checkbox';
  label.append(box, 'I understand');
  const btn = document.createElement('button');
  btn.textContent = 'Continue';
  document.body.append(label, btn);
}
