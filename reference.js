//
// theme.annotated-reference.js
//
// Human-readable, commented scaffold mirroring the key modules/classes from your
// minified bundle (theme.js). This file is meant as a reference to understand,
// document, and plan edits. It is NOT a drop-in replacement for the bundle.
// Where possible, public method names and data flows match the bundle's intent.
//
// Sections:
//  1) Global Runtime & Events
//  2) RAF Scheduler
//  3) DOM Helpers & Component Manager
//  4) Input / Pointer / Resize Manager
//  5) Button Component (SVG + GSAP-like timelines)
//  6) Loader / Intro (Eyes + Progress)
//  7) Three.js I/O (stubs for FileLoader, DRACOLoader, GLTFLoader extensions)
//
// Notes:
//  - Replace '/* TODO: wire real implementation */' with your real source logic.
//  - Keep this file nearby as living documentation and a target for future refactors.
//

/* ==========================================================================
 * 1) Global Runtime & Events
 * ========================================================================== */

export const G = {
  html: typeof document !== "undefined" ? document.documentElement : null,
  body: typeof document !== "undefined" ? document.body : null,
  window: {
    w: typeof window !== "undefined" ? window.innerWidth : 0,
    h: typeof window !== "undefined" ? window.innerHeight : 0,
    fullHeight: typeof window !== "undefined" ? window.innerHeight : 0,
    dpr: typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
  },
  mouse: {
    x: 0,
    y: 0,
    // These vectors stand in for the bundle's vector class (e.g., THREE.Vector2-like).
    gl: { set(x, y) { this.x = x; this.y = y; } },
    glNormalized: { set(x, y) { this.x = x; this.y = y; } },
    glScreenSpace: { set(x, y) { this.x = x; this.y = y; } },
    smooth: {
      glNormalized: { set(x, y) { this.x = x; this.y = y; } },
    },
  },
  mq: {
    xs: typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(max-width: 415px)") : null,
    sm: typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(min-width: 768px)") : null,
    md: typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(min-width: 1024px)") : null,
    lg: typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(min-width: 1366px)") : null,
    xlg: typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(min-width: 1921px)") : null,
  },
  urlParams: typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams(""),
  isTouch: false,
  isIOS: false, // set realistically on boot if needed
  // Flags used widely through the app
  projectToProjectTransition: false,
  currentProjectMenuId: 0,
  projectLightMode: false,
  // Subsystems (populated by your app's bootstrap code)
  ASScroll: null,
  AssetLoader: null,
  TaskScheduler: null,
  Dom2Webgl: null,
  Gl: null,
  HomeContact: null,
  ProjectMenu: null,
  World: null,
  Audio: null,
  audioMuted: false,
  debug: typeof window !== "undefined" ? new URLSearchParams(window.location.search).has("debug") : false,
  events: {
    RAF: "GRAF",
    MOUSEMOVE: "GMouseMove",
    MOUSEDRAG: "GMouseDrag",
    MOUSEDOWN: "GMouseDown",
    MOUSEUP: "GMouseUp",
    RESIZE: "GResize",
    TOUCHDETECTED: "TouchDetected",
    WHEEL: "GWheel",
  },
};

/**
 * Minimal pub/sub used by managers/components to communicate.
 * Replace with your project's event emitter if you have one.
 */
export const Emitter = (() => {
  const handlers = new Map();
  return {
    on(evt, cb) {
      if (!handlers.has(evt)) handlers.set(evt, new Set());
      handlers.get(evt).add(cb);
    },
    off(evt, cb) {
      if (handlers.has(evt)) handlers.get(evt).delete(cb);
    },
    emit(evt, payload) {
      if (!handlers.has(evt)) return;
      for (const cb of handlers.get(evt)) cb(payload);
    },
  };
})();


/* ==========================================================================
 * 2) RAF Scheduler
 * ========================================================================== */

/**
 * Register per-frame callbacks with priority.
 * In the bundle this is a tiny class that relies on a global RAF signal.
 */
export class RAFCollection {
  constructor() {
    this.callbacks = []; // { index, cb }
    this._onRAF = this._onRAF.bind(this);
    Emitter.on(G.events.RAF, this._onRAF);
  }
  add(cb, index = 0) {
    this.callbacks.push({ cb, index });
    this.callbacks.sort((a, b) => (a.index > b.index ? 1 : -1));
  }
  remove(cb) {
    this.callbacks = this.callbacks.filter(item => item.cb !== cb);
  }
  _onRAF(t) {
    for (let i = 0; i < this.callbacks.length; i++) {
      try { this.callbacks[i].cb(t); } catch (e) { /* swallow per-frame errors */ }
    }
  }
}
G.RAFCollection = new RAFCollection();


/* ==========================================================================
 * 3) DOM Helpers & Component Manager
 * ========================================================================== */

export const $all = (sel, root = document) => Array.prototype.slice.call(root.querySelectorAll(sel));
export const $one = (sel, root = document) => root.querySelector(sel);

/**
 * ComponentManager: instantiate a component for each element that matches
 * the component's static selector, and proxy lifecycle calls.
 */
export class ComponentManager {
  constructor(Component, parentEl = document.body) {
    if (typeof Component.selector === "undefined") {
      throw new Error(`Component "${Component.name}" must define a static 'selector'.`);
    }
    this.Component = Component;
    this.parentEl = parentEl;
    this.components = [];
    const nodes = $all(Component.selector, parentEl);
    for (const node of nodes) this.components.push(new Component(node));
  }
  make(el) { this.components.push(new this.Component(el)); }
  forEach(fn) { this.components.forEach(fn); }
  callAll(method, ...args) { this.components.forEach(c => c?.[method]?.(...args)); }
  destroy() { this.callAll("destroy"); this.components = []; }
}


/* ==========================================================================
 * 4) Input / Pointer / Resize Manager
 * ========================================================================== */

export class InputManager {
  constructor() {
    this.dragging = false;
    this.mousePos = { x: 0, y: 0 };
    this.prevMousePos = { x: 0, y: 0 };
    this.origMousePos = { x: 0, y: 0 };

    // Detect touch & update body class
    if (typeof document !== "undefined" && "ontouchstart" in document.documentElement) {
      G.isTouch = true;
      document.body?.classList?.add("is-touch");
      this._detectMouseLater(); // flip back to mouse if movement detected
    }

    // Bind events
    if (G.isTouch) this._addTouchEvents();
    else this._addMouseEvents();

    this._onResize(); // initial CSS vars
    // In the bundle GSAP's ticker drives RAF; we simulate an external RAF producer.
    // Hook your render loop to call: Emitter.emit(G.events.RAF, performance.now())
    window?.addEventListener?.("resize", this._onResize.bind(this));
  }

  _addMouseEvents() {
    window.addEventListener("mousemove", this._onPointerMove.bind(this), { passive: true });
    window.addEventListener("mousedown", this._onPointerDown.bind(this));
    window.addEventListener("mouseup", this._onPointerUp.bind(this));
    window.addEventListener("dragend", this._onPointerUp.bind(this));
    window.addEventListener("contextmenu", this._onPointerUp.bind(this));
  }
  _addTouchEvents() {
    window.addEventListener("touchmove", this._onPointerMove.bind(this), { passive: true });
    window.addEventListener("touchstart", this._onPointerDown.bind(this));
    window.addEventListener("touchend", this._onPointerUp.bind(this));
  }

  _onResize() {
    // Maintain mobile-friendly vh units
    if (typeof document !== "undefined") {
      document.documentElement.style.setProperty("--screen-height", `${window.innerHeight}px`);
      G.window.w = window.innerWidth;
      G.window.h = window.innerHeight;
      document.documentElement.style.setProperty("--vh", 0.01 * G.window.h + "px");
    }
    Emitter.emit(G.events.RESIZE);
  }

  _onPointerMove(e) {
    const x = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    const y = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;

    this.mousePos = { x, y };
    G.mouse.x = x; G.mouse.y = y;

    // Update multiple coordinate spaces used by GL & UI layers
    G.mouse.gl.set(x - G.window.w / 2, -(y - G.window.h / 2));
    G.mouse.glNormalized.set((x / G.window.w) * 2 - 1, -(y / G.window.h) * 2 + 1);
    G.mouse.glScreenSpace.set(x / G.window.w, 1 - y / G.window.h);

    Emitter.emit(G.events.MOUSEMOVE, { mousePos: this.mousePos, event: e });

    if (this.dragging) {
      Emitter.emit(G.events.MOUSEDRAG, {
        ox: this.origMousePos.x, px: this.prevMousePos.x, x: this.mousePos.x,
        oy: this.origMousePos.y, py: this.prevMousePos.y, y: this.mousePos.y,
        event: e,
      });
      this.prevMousePos = { ...this.mousePos };
    }
  }

  _onPointerDown(e) {
    const x = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    const y = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
    this.mousePos = this.origMousePos = this.prevMousePos = { x, y };

    G.mouse.x = x; G.mouse.y = y;
    G.mouse.gl.set(x - G.window.w / 2, -(y - G.window.h / 2));
    G.mouse.glNormalized.set((x / G.window.w) * 2 - 1, -(y / G.window.h) * 2 + 1);
    G.mouse.glScreenSpace.set(x / G.window.w, 1 - y / G.window.h);

    Emitter.emit(G.events.MOUSEDOWN, { mousePos: this.mousePos, event: e });
    this.dragging = true;
  }

  _onPointerUp(e) {
    Emitter.emit(G.events.MOUSEUP, { event: e });
    this.dragging = false;
  }

  _detectMouseLater() {
    // If a real mouse moves, flip the isTouch flag off and remove the class.
    window.addEventListener("mousemove", (ev) => {
      if (Math.abs(ev.movementX) > 0 || Math.abs(ev.movementY) > 0) {
        G.isTouch = false;
        document.body?.classList?.remove("is-touch");
        Emitter.emit("TouchMouse"); // mirrors bundle's TOUCHMOUSE event
      }
    });
  }
}


/* ==========================================================================
 * 5) Button Component (SVG + animations)
 * ========================================================================== */

/**
 * This is an approximate, dependency-free representation.
 * In the bundle, SVGs are created via a helper and animations use GSAP.
 */
export class Button {
  static get selector() { return ".js-btn:not(.js-manager-ignore)"; }

  constructor(el) {
    this.el = el;
    this.buttonType = el?.dataset?.btn || "border";     // "border" | "fill"
    this.togglecontent = el?.dataset?.togglecontent || "none"; // enables selectable

    this.dom = {
      el,
      inner: el.querySelector(".js-btn-inner") || el,
      content: el.querySelector(".js-btn-content"),
      icon: el.querySelector(".js-btn-icon"),
    };

    // Dimensions at mount
    this.btnWidth = el.clientWidth;
    this.btnHeight = el.clientHeight;

    // Visual params used by the SVG skin
    this.svgSettings = { width: "100%", height: "100%", strokeWidth: 2, rx: "1.3em", ry: "3em" };

    // Build SVG shell & content clones; wire interactions
    this._build();
    this._addEvents();
  }

  _build() {
    // In the bundle:
    // - create SVG canvas & rects
    // - build masked fill/border layers
    // - clone .js-btn-content to create a "cloned" layer for transitions
    // - setup GSAP timelines for hover/border-reveal/selectable states
    // TODO: wire your real implementation
  }

  _addEvents() {
    this._mouseEnter = this._mouseEnter?.bind?.(this) || (() => {});
    this._mouseLeave = this._mouseLeave?.bind?.(this) || (() => {});
    this._onClick     = this._onClick?.bind?.(this) || ((e) => e?.preventDefault?.());

    this.el.addEventListener("mouseenter", this._mouseEnter);
    this.el.addEventListener("mouseleave", this._mouseLeave);
    // Only intercept clicks if not an external link/hash
    const href = this.el.getAttribute("href") || "";
    if (!href || href.startsWith("#")) {
      this.el.addEventListener("click", this._onClick);
    }
  }

  _mouseEnter() {
    // Play hover timeline; optionally play audio hover SFX via G.Audio
    // TODO: connect to your animation lib
    if (G.Audio?.play) G.Audio.play({ key: "audio.hover" });
  }
  _mouseLeave() {
    // Reverse hover timeline
  }
  _onClick(e) {
    e.preventDefault();
    // If part of a content toggle group, set active & swap content
    // TODO: implement selectable behavior
  }

  destroy() {
    this.el.removeEventListener("mouseenter", this._mouseEnter);
    this.el.removeEventListener("mouseleave", this._mouseLeave);
    this.el.removeEventListener("click", this._onClick);
  }
}


/* ==========================================================================
 * 6) Loader / Intro (Eyes + Progress)
 * ========================================================================== */

export class IntroLoader {
  constructor() {
    // DOM nodes (use your actual selectors)
    this.dom = {
      loader: $one(".js-loader"),
      loaderBox: $all(".js-loader-box"),
      progress: $one(".js-loader-progress"),
      progressInner: $one(".js-loader-progress-inner"),
    };
    this.eyes = {
      el: $one(".js-eyes"),
      left: $one(".js-eyes-left"),
      right: $one(".js-eyes-right"),
      leftTop: $one(".js-eyes-eyelid-left-top"),
      leftBottom: $one(".js-eyes-eyelid-left-bottom"),
      rightTop: $one(".js-eyes-eyelid-right-top"),
      rightBottom: $one(".js-eyes-eyelid-right-bottom"),
      normal: $all(".js-eyes-normal"),
      heart: $all(".js-eyes-heart"),
    };
    this.enterButton = $one(".js-enter-btn");
    this.enterNoAudioButton = $one(".js-enter-no-audio-btn");

    // Progress bookkeeping
    this.percent = 0;
    this.hidden = false;

    // Eye motion state
    this.btnRect = { left: 0, top: 0, width: 0, height: 0 };
    this.btnCenterX = 0;
    this.btnCenterY = 0;
    this.eyesCenterY = 0;
    this.maxMovementX = 8;
    this.maxMovementY = 12;
    this.current = { x: 0, y: 0 };
    this.mouse = { x: 0, y: 0 };
    this.currentDist = 0;

    // Listeners
    Emitter.on("AssetsProgress", this.onAssetsProgress.bind(this));
    Emitter.on("AssetLoader:afterResolve", this.onAssetsLoaded.bind(this));
    this.enterButton?.addEventListener?.("click", this.onEnterButtonClick.bind(this));
    this.enterNoAudioButton?.addEventListener?.("click", this.onEnterNoAudioButtonClick.bind(this));

    // Per-frame update
    G.RAFCollection.add(this.onRAF.bind(this), 3);
    Emitter.on(G.events.MOUSEMOVE, () => this.onPointerMove());
    Emitter.on(G.events.RESIZE, () => this.onResize());
  }

  onAssetsProgress({ percent }) {
    if (percent === this.percent) return;
    this.percent = percent;
    // Opposed translation for outer vs. inner to create a fill effect
    if (this.dom.progress) this.dom.progress.style.transform = `translateY(${100 - percent}%)`;
    if (this.dom.progressInner) this.dom.progressInner.style.transform = `translateY(-${100 - percent}%)`;
  }

  onAssetsLoaded() {
    this.onAssetsProgress({ percent: 100 });
    // Reveal enter buttons; optionally skip loader
    if (!G.isTouch) this.buildEyes();
    if (G.urlParams.has("skiploader")) this.hide();
  }

  buildEyes() {
    this.createEyelidTl();
    this.getBtnCenter();
    this.getEyesCenter();
    // Mouse enter/leave "heart" overlay could be handled here
  }

  show() {
    // Fade in loader & progress column
    if (this.dom.loader) this.dom.loader.style.opacity = 1;
  }

  hide(delay = 0) {
    // Fade out eyes + loader; reset transforms
    this.hidden = true;
    if (this.eyes.el) this.eyes.el.style.opacity = 0;
    if (this.dom.loader) this.dom.loader.style.opacity = 0;
  }

  openEyes() {
    // Apply eyelid positions for "open" state (percentage-based transforms)
    // TODO: connect to your animation lib if needed
  }

  createEyelidTl() {
    // Create an internal representation of the eyelid animation.
    // In the bundle it's a GSAP timeline; here we store target %s.
    this._eyelid = { leftTop: -59, leftBottom: 43, rightTop: -59, rightBottom: 67 };
  }

  getEyesCenter() {
    if (!this.eyes.el) return;
    const rect = this.eyes.el.getBoundingClientRect();
    this.eyesCenterY = rect.top + rect.height / 2;
    this.maxMovementX = rect.width / 15;
    this.maxMovementY = (rect.width / G.window.w) * 65;
  }

  getBtnCenter() {
    if (!this.enterButton) return;
    const r = this.enterButton.getBoundingClientRect();
    this.btnRect = r;
    this.btnCenterX = r.left + r.width / 2;
    this.btnCenterY = r.top + r.height / 2;
  }

  onResize() {
    this.getEyesCenter();
    this.getBtnCenter();
  }

  onPointerMove() {
    // Normalize pointer deltas around the button center into [-1, 1] ranges
    this.mouse.x = (G.mouse.x - this.btnCenterX) / G.window.w * 2;
    this.mouse.y = (G.mouse.y - this.btnCenterY) / G.window.h * 2;
  }

  onRAF() {
    // Smooth lerp to the target position and apply CSS transforms to eyes
    const lerp = (a, b, t) => a + (b - a) * t;
    const e = Math.min(this.mouse.y || 0, 3);
    this.current.x = lerp(this.current.x, this.mouse.x, 0.1);
    this.current.y = lerp(this.current.y, e, 0.1);
    const dist = Math.hypot(this.mouse.x, this.mouse.y);
    this.currentDist = lerp(this.currentDist, dist, 0.09);

    const dx = (this.current.x || 0) * (this.maxMovementX || 0);
    const dy = (this.current.y || 0) * (this.maxMovementY || 0);
    if (this.eyes.left)  this.eyes.left.style.transform  = `translate3d(${dx}px, ${dy}px, 0)`;
    if (this.eyes.right) this.eyes.right.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
  }

  onEnterButtonClick()   { if (G.Audio?.muteAll) G.Audio.muteAll(false); this.hide(); }
  onEnterNoAudioButtonClick() { if (G.Audio?.muteAll) G.Audio.muteAll(true);  this.hide(); }
}


/* ==========================================================================
 * 7) Three.js I/O (stubs)
 * ========================================================================== */

/**
 * FileLoader: add request headers, credentials, responseType, and basic cache.
 * In your real code, use THREE.FileLoader directly; this is a conceptual stub.
 */
export class FileLoader {
  constructor() {
    this.responseType = "arraybuffer";
    this.requestHeader = {};
    this.withCredentials = false;
    this._cache = new Map();
  }
  setResponseType(rt) { this.responseType = rt; return this; }
  setMimeType(mt) { this.mimeType = mt; return this; }
  setRequestHeader(h) { this.requestHeader = h || {}; return this; }
  setWithCredentials(v) { this.withCredentials = !!v; return this; }
  load(url, onLoad, onProgress, onError) {
    if (this._cache.has(url)) {
      onLoad?.(this._cache.get(url));
      return;
    }
    fetch(url, {
      method: "GET",
      headers: this.requestHeader,
      credentials: this.withCredentials ? "include" : "same-origin",
    }).then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let data = await (this.responseType === "arraybuffer" ? res.arrayBuffer() : res.text());
      this._cache.set(url, data);
      onLoad?.(data);
    }).catch((err) => onError?.(err));
  }
}

/**
 * DRACOLoader: in the bundle this sets up a worker pool, decodes to BufferGeometry,
 * and supports attribute remapping. This stub is here only to document the API.
 */
export class DRACOLoader {
  constructor() {
    this.decoderPath = "";
    this.decoderConfig = {};
    this.workerLimit = 4;
  }
  setDecoderPath(p) { this.decoderPath = p; return this; }
  setDecoderConfig(cfg) { this.decoderConfig = cfg; return this; }
  setWorkerLimit(n) { this.workerLimit = n; return this; }
  preload() { /* load decoder files in real impl */ return this; }
  decodeDracoFile(arrayBuffer, onDecode /*, attrIDs, attrTypes */) {
    // TODO: plug your real Draco pipeline
    onDecode?.({ /* geometry */ });
  }
}

/**
 * GLTFLoader: registers many extensions (KHR/EXT). In this scaffold we only
 * define the surface and where you'd inject KTX2/Draco/Meshopt decoders.
 */
export class GLTFLoader {
  constructor() {
    this.dracoLoader = null;
    this.ktx2Loader = null;
    this.meshoptDecoder = null;
    this._plugins = [];
  }
  setDRACOLoader(l) { this.dracoLoader = l; return this; }
  setKTX2Loader(l) { this.ktx2Loader = l; return this; }
  setMeshoptDecoder(m) { this.meshoptDecoder = m; return this; }
  register(pluginFactory) {
    const plug = pluginFactory(this);
    this._plugins.push(plug);
    return this;
  }
  load(url, onLoad, onProgress, onError) {
    // In the real bundle, a FileLoader fetch + parse pipeline is used
    new FileLoader().setResponseType("arraybuffer").load(
      url,
      (buf) => {
        try {
          // TODO: parse buffer into a glTF scene; call onLoad(scene)
          onLoad?.({ /* scene, scenes, animations, cameras, asset */ });
        } catch (e) {
          onError?.(e);
        }
      },
      onProgress,
      onError
    );
  }
}


/* ==========================================================================
 * Boot helpers
 * ========================================================================== */

/**
 * Call this once to initialize input and wire a requestAnimationFrame
 * loop that feeds the global RAF event used by the RAFCollection.
 */
export function bootRuntime({ driveRAF = true } = {}) {
  // Touch/iOS flags if you need them
  try {
    G.isIOS = [
      "iPad Simulator", "iPhone Simulator", "iPod Simulator",
      "iPad", "iPhone", "iPod"
    ].includes(navigator.platform) || (navigator.userAgent.includes("Mac") && "ontouchend" in document);
  } catch {}

  // Start input manager
  new InputManager();

  if (driveRAF && typeof window !== "undefined") {
    const loop = (t) => { Emitter.emit(G.events.RAF, t); window.requestAnimationFrame(loop); };
    window.requestAnimationFrame(loop);
  }
}
