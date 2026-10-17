// Grants media permissions and enables SYSTEM AUDIO loopback capture.
// With this handler in place, getDisplayMedia({ audio: true }) in the
// renderer returns the machine's audio output - no drivers needed on Windows.
import { session, desktopCapturer } from 'electron';

export function registerMediaPermissions() {
  const ses = session.defaultSession;

  // Auto-approve microphone / display-capture permission prompts.
  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'mediaKeySystem', 'fullscreen', 'clipboard-sanitized-write'];
    callback(allowed.includes(permission));
  });

  // System audio capture: Chromium's WASAPI loopback, enabled via 'loopback'.
  ses.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'] });
      callback({ video: sources[0], audio: 'loopback' });
    } catch (err) {
      console.error('[mediaPermissions] display-media handler failed:', err);
      callback({});
    }
  });
}
