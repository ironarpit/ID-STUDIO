import { app, BrowserWindow, net, protocol, session, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP_NAME = 'ID STUDIO';
const APP_USER_MODEL_ID = 'com.ironarpit.idstudio';
const PERSISTENT_PARTITION = 'persist:idstudio';
const APP_SCHEME = 'app';
const APP_HOST = 'idstudio';
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['https:']);
const ALLOWED_PERMISSIONS = new Set(['media', 'mediaKeySystem', 'clipboard-sanitized-write']);

let mainWindow: BrowserWindow | null = null;

// Ensure consistent application name and Windows taskbar identity
app.setName(APP_NAME);
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

// Register invariant privileged scheme so IndexedDB & localStorage origin never changes across installs/updates
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function getDistDirectory(): string {
  return path.join(app.getAppPath(), 'dist');
}

function getWindowIconPath(): string | undefined {
  const candidates = [
    path.join(app.getAppPath(), 'electron', 'icon.ico'),
    path.join(process.resourcesPath || '', 'electron', 'icon.ico'),
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

function getDevServerOrigin(): string | null {
  const raw = process.env.ELECTRON_RENDERER_URL;
  if (!raw || app.isPackaged) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function isTrustedOrigin(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.origin === APP_ORIGIN) return true;
    const devOrigin = getDevServerOrigin();
    return Boolean(devOrigin && parsed.origin === devOrigin);
  } catch {
    return false;
  }
}

function openApprovedExternalUrl(rawUrl: string): void {
  try {
    const parsed = new URL(rawUrl);
    if (ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
      void shell.openExternal(parsed.toString());
    }
  } catch {
    // Ignore malformed URLs
  }
}

function registerDistProtocol(appSession: Electron.Session): void {
  const distDir = path.resolve(getDistDirectory());

  appSession.protocol.handle(APP_SCHEME, (request) => {
    try {
      const requestUrl = new URL(request.url);
      if (requestUrl.hostname !== APP_HOST) {
        return new Response('Forbidden', { status: 403 });
      }

      let relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '');
      if (!relativePath || relativePath.endsWith('/')) {
        relativePath = 'index.html';
      }

      let resolvedPath = path.resolve(distDir, relativePath);
      const insideDist =
        resolvedPath === distDir || resolvedPath.startsWith(`${distDir}${path.sep}`);

      if (!insideDist) {
        return new Response('Forbidden', { status: 403 });
      }

      // SPA route fallback for extensionless paths
      if (!fs.existsSync(resolvedPath) || fs.statSync(resolvedPath).isDirectory()) {
        if (!path.extname(relativePath)) {
          resolvedPath = path.join(distDir, 'index.html');
        } else {
          return new Response('Not Found', { status: 404 });
        }
      }

      return net.fetch(pathToFileURL(resolvedPath).toString());
    } catch {
      return new Response('Internal Error', { status: 500 });
    }
  });
}

function configureSessionSecurity(appSession: Electron.Session): void {
  appSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    if (!isTrustedOrigin(requestingOrigin)) return false;
    return ALLOWED_PERMISSIONS.has(permission);
  });

  appSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const currentUrl = webContents.getURL();
    if (!isTrustedOrigin(currentUrl)) {
      callback(false);
      return;
    }
    callback(ALLOWED_PERMISSIONS.has(permission));
  });
}

function createMainWindow(): BrowserWindow {
  const appSession = session.fromPartition(PERSISTENT_PARTITION);
  const windowIcon = getWindowIconPath();

  const win = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    title: APP_NAME,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    ...(windowIcon ? { icon: windowIcon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      partition: PERSISTENT_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  // Route external links (e.g., WhatsApp links) safely to default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isTrustedOrigin(url)) {
      openApprovedExternalUrl(url);
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isTrustedOrigin(targetUrl)) {
      event.preventDefault();
      openApprovedExternalUrl(targetUrl);
    }
  });

  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl && !app.isPackaged) {
    void win.loadURL(devUrl);
  } else {
    void win.loadURL(`${APP_ORIGIN}/index.html`);
  }

  return win;
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    const appSession = session.fromPartition(PERSISTENT_PARTITION);
    registerDistProtocol(appSession);
    configureSessionSecurity(appSession);
    mainWindow = createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
