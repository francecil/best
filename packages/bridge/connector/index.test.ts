import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectBridge } from './index';

describe('connectBridge', () => {
  let backgroundPort: {
    postMessage: ReturnType<typeof vi.fn>;
    onMessage: { addListener: ReturnType<typeof vi.fn>; removeListener: ReturnType<typeof vi.fn> };
    onDisconnect: { addListener: ReturnType<typeof vi.fn>; removeListener: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    backgroundPort = {
      postMessage: vi.fn(),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      onDisconnect: { addListener: vi.fn(), removeListener: vi.fn() },
    };
    vi.stubGlobal('chrome', {
      runtime: {
        connect: vi.fn(() => backgroundPort),
      },
    } as unknown as typeof chrome);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('on bridge:connect opens background port and posts init port to page', () => {
    const postSpy = vi.spyOn(window, 'postMessage');
    connectBridge();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'bridge:connect' },
        source: window,
      }),
    );

    expect(chrome.runtime.connect).toHaveBeenCalledWith({ name: 'bridge' });
    const initCall = postSpy.mock.calls.find(c => (c[0] as { type?: string })?.type === 'bridge:init');
    expect(initCall).toBeDefined();
    expect((initCall![0] as { port?: MessagePort }).port).toBeInstanceOf(MessagePort);
  });

  it('ignores bridge:connect from other windows', () => {
    const postSpy = vi.spyOn(window, 'postMessage');
    connectBridge();

    const foreign = {} as Window;
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'bridge:connect' },
        source: foreign,
      }),
    );

    expect(chrome.runtime.connect).not.toHaveBeenCalled();
    expect(postSpy).not.toHaveBeenCalled();
  });
});
