import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectCapabilities } from '../../src/tui/engine/terminal-image.js';

describe('terminal capability hyperlink detection', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.PI_HYPERLINKS;
    delete process.env.PI_IMAGE_PROTOCOL;
    delete process.env.PI_TRUE_COLOR;
    delete process.env.TMUX;
    delete process.env.TERM;
    delete process.env.TERM_PROGRAM;
    delete process.env.TERMINAL_EMULATOR;
    delete process.env.COLORTERM;
    delete process.env.KITTY_WINDOW_ID;
    delete process.env.GHOSTTY_RESOURCES_DIR;
    delete process.env.WEZTERM_PANE;
    delete process.env.WARP_SESSION_ID;
    delete process.env.WARP_TERMINAL_SESSION_UUID;
    delete process.env.ITERM_SESSION_ID;
    delete process.env.WT_SESSION;
    delete process.env.VTE_VERSION;
    delete process.env.KONSOLE_VERSION;
    delete process.env.FOOT_TERM;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('detects hyperlinks on GNOME Terminal via VTE_VERSION >= 5000', () => {
    process.env.VTE_VERSION = '6800';
    const caps = detectCapabilities(() => false);
    expect(caps.hyperlinks).toBe(true);
    expect(caps.trueColor).toBe(true);
  });

  it('detects hyperlinks on GNOME Terminal via TERM_PROGRAM', () => {
    process.env.TERM_PROGRAM = 'gnome-terminal';
    const caps = detectCapabilities(() => false);
    expect(caps.hyperlinks).toBe(true);
    expect(caps.trueColor).toBe(true);
  });

  it('disables hyperlinks on older VTE versions (< 5000)', () => {
    process.env.VTE_VERSION = '4800';
    const caps = detectCapabilities(() => false);
    expect(caps.hyperlinks).toBe(false);
  });

  it('detects hyperlinks on KDE Konsole via KONSOLE_VERSION', () => {
    process.env.KONSOLE_VERSION = '230800';
    const caps = detectCapabilities(() => false);
    expect(caps.hyperlinks).toBe(true);
    expect(caps.trueColor).toBe(true);
  });

  it('detects hyperlinks on Foot terminal via FOOT_TERM', () => {
    process.env.FOOT_TERM = '1';
    const caps = detectCapabilities(() => false);
    expect(caps.hyperlinks).toBe(true);
    expect(caps.trueColor).toBe(true);
  });

  it('detects hyperlinks on Foot terminal via TERM=foot', () => {
    process.env.TERM = 'foot';
    const caps = detectCapabilities(() => false);
    expect(caps.hyperlinks).toBe(true);
    expect(caps.trueColor).toBe(true);
  });

  it('falls back to outer terminal hyperlink support under tmux when probe is false', () => {
    process.env.TMUX = '/tmp/tmux-1000/default,1234,0';
    process.env.TERM = 'tmux-256color';
    process.env.VTE_VERSION = '6800';
    const caps = detectCapabilities(() => false);
    expect(caps.hyperlinks).toBe(true);
  });

  it('respects tmux probe when tmux forwards hyperlinks', () => {
    process.env.TMUX = '/tmp/tmux-1000/default,1234,0';
    process.env.TERM = 'tmux-256color';
    const caps = detectCapabilities(() => true);
    expect(caps.hyperlinks).toBe(true);
  });

  it('disables hyperlinks under tmux when neither tmux nor outer terminal supports it', () => {
    process.env.TMUX = '/tmp/tmux-1000/default,1234,0';
    process.env.TERM = 'tmux-256color';
    const caps = detectCapabilities(() => false);
    expect(caps.hyperlinks).toBe(false);
  });

  it('allows explicit override via PI_HYPERLINKS environment variable', () => {
    process.env.VTE_VERSION = '6800';
    process.env.PI_HYPERLINKS = '0';
    expect(detectCapabilities(() => false).hyperlinks).toBe(false);

    delete process.env.VTE_VERSION;
    process.env.PI_HYPERLINKS = '1';
    expect(detectCapabilities(() => false).hyperlinks).toBe(true);
  });
});
