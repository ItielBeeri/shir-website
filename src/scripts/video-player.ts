/**
 * SoftVideo's player: the controls its markup carries, wired to the <video>,
 * with the state on the <figure> as classes for the stylesheet to read.
 *
 * It never starts anything by itself. One video plays at a time, and a copy
 * that a layout change hides - remark-stack-after renders two - stops rather
 * than playing on unseen.
 *
 * Captions are drawn into the player's own element from the track's cues
 * (`mode = 'hidden'` still fires `cuechange`), so they sit above the control
 * bar and read in the site's type, in every browser.
 */
import { clock, spoken } from '@/lib/duration';

/** How long the controls stay after the pointer stops, while playing. */
const IDLE_MS = 2000;

const players = new Set<HTMLVideoElement>();

function enhance(figure: HTMLElement): void {
  const video = figure.querySelector<HTMLVideoElement>('video');
  const frame = figure.querySelector<HTMLElement>('.soft-video__frame');
  const start = figure.querySelector<HTMLButtonElement>('.soft-video__start');
  const seek = figure.querySelector<HTMLInputElement>('.soft-video__seek');
  if (!video || !frame || !start || !seek) return;

  const control = (action: string) => figure.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  const toggle = control('play');
  const mute = control('mute');
  const captions = control('captions');
  const full = control('fullscreen');
  const current = figure.querySelector<HTMLElement>('[data-current]');
  const total = figure.querySelector<HTMLElement>('[data-total]');
  const caption = figure.querySelector<HTMLElement>('.soft-video__caption');
  const error = figure.querySelector<HTMLElement>('.soft-video__error');

  // The native controls are the no-JS player; from here on, these are.
  video.controls = false;
  players.add(video);

  let duration = Number(video.dataset.duration) || 0;
  let scrubbing = false;
  let captionsOn = false;
  let idleTimer = 0;
  // A poster-less video shows its frame by media fragment; playback should
  // still start at the beginning.
  let fromFragment = video.dataset.fragment !== undefined;

  const state = (name: string, on: boolean) => figure.classList.toggle(name, on);

  /**
   * `announce` for a change the visitor made. A focused slider is read aloud
   * on every change, so while it plays under focus the spoken value waits.
   */
  const showTime = (announce = false): void => {
    const t = video.currentTime;
    if (!scrubbing) seek.value = String(t);
    seek.style.setProperty('--progress', duration ? `${Math.min(100, (t / duration) * 100)}%` : '0%');
    if (current) current.textContent = clock(t);
    if (duration && (announce || video.paused || document.activeElement !== seek)) {
      seek.setAttribute('aria-valuetext', `${spoken(t)} מתוך ${spoken(duration)}`);
    }
  };

  const showDuration = (): void => {
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    duration = video.duration;
    seek.max = String(duration);
    if (total) total.textContent = clock(duration);
    showTime();
  };

  const wake = (): void => {
    state('is-idle', false);
    window.clearTimeout(idleTimer);
    if (!video.paused) idleTimer = window.setTimeout(() => state('is-idle', true), IDLE_MS);
  };

  const play = (): void => {
    if (fromFragment) {
      video.currentTime = 0;
      fromFragment = false;
    }
    void video.play().catch(() => {
      /* refused - by a policy, or a source that failed; `error` says which */
    });
  };

  const togglePlay = (): void => (video.paused || video.ended ? play() : video.pause());

  start.addEventListener('click', play);
  toggle?.addEventListener('click', togglePlay);

  video.addEventListener('click', (event) => {
    // A finger's first tap on a playing video brings the controls back;
    // only a tap on visible controls should change anything.
    if ((event as PointerEvent).pointerType === 'touch' && figure.classList.contains('is-idle')) {
      wake();
      return;
    }
    togglePlay();
  });

  video.addEventListener('play', () => {
    for (const other of players) if (other !== video) other.pause();
    state('is-started', true);
    state('is-playing', true);
    if (toggle) toggle.setAttribute('aria-label', toggle.dataset.labelPause ?? '');
    // The start button hides once playing; keyboard focus on it goes to the
    // control that stops it, not to the top of the page.
    if (document.activeElement === start && start.matches(':focus-visible')) toggle?.focus();
    wake();
  });

  video.addEventListener('pause', () => {
    state('is-playing', false);
    if (toggle) toggle.setAttribute('aria-label', toggle.dataset.labelPlay ?? '');
    wake();
  });

  video.addEventListener('ended', () => {
    // Back to the poster. Focus in the bar, which is about to disappear, goes
    // to the button that replays, rather than to the top of the page.
    const hadFocus = figure.querySelector('.soft-video__bar')?.contains(document.activeElement);
    state('is-started', false);
    state('is-idle', false);
    if (hadFocus) start.focus();
  });

  video.addEventListener('waiting', () => state('is-waiting', true));
  for (const settled of ['playing', 'canplay', 'pause', 'error']) {
    video.addEventListener(settled, () => state('is-waiting', false));
  }

  video.addEventListener('loadedmetadata', showDuration);
  video.addEventListener('durationchange', showDuration);
  video.addEventListener('timeupdate', () => showTime());

  // Each <source> that fails reports on itself; only the last means nothing played.
  const sources = video.querySelectorAll('source');
  sources[sources.length - 1]?.addEventListener('error', () => {
    if (error) error.hidden = false;
  });

  seek.addEventListener('pointerdown', () => (scrubbing = true));
  seek.addEventListener('input', () => {
    video.currentTime = Number(seek.value);
    showTime(true);
  });
  seek.addEventListener('change', () => (scrubbing = false));
  // Arrows move five seconds, as in any player. The slider's own step is a
  // tenth of a second, for dragging, and would take 50 presses to do the same.
  seek.addEventListener('keydown', (event) => {
    const delta = ({ ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5 } as Record<string, number>)[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    video.currentTime = Math.min(duration || video.duration || 0, Math.max(0, video.currentTime + delta));
    showTime(true);
  });

  mute?.addEventListener('click', () => {
    video.muted = !video.muted;
  });
  video.addEventListener('volumechange', () => {
    state('is-muted', video.muted);
    mute?.setAttribute('aria-pressed', String(video.muted));
  });

  const track = video.textTracks[0];
  if (track) {
    track.mode = 'hidden';
    const render = (): void => {
      if (!caption) return;
      const text = captionsOn
        ? Array.from(track.activeCues ?? [])
            .map((cue) => (cue as VTTCue).text.replace(/<[^>]*>/g, ''))
            .join('\n')
        : '';
      caption.textContent = text;
      caption.hidden = !text;
    };
    track.addEventListener('cuechange', render);
    captions?.addEventListener('click', () => {
      captionsOn = !captionsOn;
      captions.setAttribute('aria-pressed', String(captionsOn));
      // Some engines load a hidden track's cues only once it is asked for.
      track.mode = 'hidden';
      render();
    });
  }

  const canFill = typeof frame.requestFullscreen === 'function';
  const iosFill = (video as HTMLVideoElement & { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen;
  if (!canFill && !iosFill) full?.remove();
  full?.addEventListener('click', () => {
    if (document.fullscreenElement === frame) void document.exitFullscreen();
    else if (canFill) void frame.requestFullscreen().catch(() => undefined);
    // An iPhone fills the screen with its own player, and only from a video.
    else iosFill?.call(video);
  });
  document.addEventListener('fullscreenchange', () => {
    const filled = document.fullscreenElement === frame;
    state('is-full', filled);
    full?.setAttribute('aria-label', (filled ? full.dataset.labelExit : full.dataset.labelEnter) ?? '');
  });

  // Activity over the picture, not the figure: reading the description
  // below it should not bring the controls back over the video.
  for (const type of ['pointermove', 'pointerdown', 'keydown', 'focusin']) {
    frame.addEventListener(type, wake, { passive: true });
  }
  // A mouse that leaves takes the controls with it; a finger never hovers.
  frame.addEventListener('pointerleave', (event) => {
    if (event.pointerType !== 'mouse' || video.paused) return;
    window.clearTimeout(idleTimer);
    state('is-idle', true);
  });

  // A copy the layout has just hidden must not play on. Its own display, not
  // its size: a window shrunk to nothing reports a zero-width box too.
  new ResizeObserver(() => {
    if (!video.paused && getComputedStyle(figure).display === 'none') video.pause();
  }).observe(figure);

  showTime();
}

document.querySelectorAll<HTMLElement>('[data-soft-video]').forEach(enhance);
