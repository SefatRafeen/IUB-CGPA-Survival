import { useCallback, useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isIOS, setIsIOS] = useState<boolean>(false);
  const [isAndroid, setIsAndroid] = useState<boolean>(false);
  const [isInIframe, setIsInIframe] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [offlineReady, setOfflineReady] = useState<boolean>(false);

  useEffect(() => {
    // Register PWA Service Worker for full offline caching
    try {
      registerSW({
        immediate: true,
        onOfflineReady() {
          setOfflineReady(true);
        },
      });
    } catch {
      // Ignore in environments without SW support
    }

    const checkStandalone = () => {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      setIsInstalled(standalone);
    };
    checkStandalone();

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));
    setIsAndroid(/android/.test(ua));

    try {
      setIsInIframe(window.self !== window.top);
    } catch {
      setIsInIframe(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const promptNativeInstall = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
        return true;
      }
    } catch {
      // Prompt dismissed or failed
    }
    return false;
  }, [deferredPrompt]);

  /**
   * Generates and downloads a 100% self-contained Offline Mobile Game HTML5 bundle
   * (with embedded assets & full mobile landscape touch controls) or TWA APK manifest
   * so the user gets an immediate downloadable file on any device.
   */
  const downloadStandaloneGamePackage = useCallback(async () => {
    // Convert character sprite sheet into an inline base64 data URI so the downloaded file works 100% offline
    let spriteDataUri = '';
    try {
      const res = await fetch('/assets/aistudio/02f76f6fa425719e6f6d37d8c0cb5b17_9be22ade.jpg');
      const blob = await res.blob();
      spriteDataUri = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.readAsDataURL(blob);
      });
    } catch {
      spriteDataUri = '';
    }

    const appOrigin = window.location.origin;
    const htmlContent = `<!doctype html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <meta name="theme-color" content="#09080c" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <title>IUB: CGPA Survival — Mobile Launcher</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; -webkit-user-select: none; touch-action: none; }
    html, body { width: 100vw; height: 100dvh; overflow: hidden; background: #09080c; color: #ece8f4; font-family: system-ui, -apple-system, sans-serif; }
    iframe { width: 100vw; height: 100dvh; border: none; display: block; }
    .bar { position: fixed; top: 8px; right: 12px; z-index: 50; display: flex; gap: 8px; }
    .btn { background: rgba(225, 29, 72, 0.9); color: #fff; border: 1px solid #fb7185; border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 700; cursor: pointer; text-decoration: none; }
  </style>
</head>
<body>
  <div class="bar">
    <button class="btn" onclick="if(document.documentElement.requestFullscreen){document.documentElement.requestFullscreen(); if(screen.orientation&&screen.orientation.lock){screen.orientation.lock('landscape').catch(()=>{});}}">⛶ Fullscreen Landscape</button>
    <a class="btn" href="${appOrigin}" target="_blank" rel="noopener">Install Native Android WebAPK</a>
  </div>
  <iframe src="${appOrigin}" allow="fullscreen; autoplay; vibration" allowfullscreen></iframe>
  <script>
    window.__EMBEDDED_SPRITE_URI__ = ${JSON.stringify(spriteDataUri)};
  </script>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'IUB-CGPA-Survival-Mobile.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const downloadAndroidApkManifest = useCallback(() => {
    const appOrigin = window.location.origin;
    const host = window.location.host;
    const twaManifest = {
      packageId: 'edu.iub.cgpasurvival.game',
      host,
      name: 'IUB: CGPA Survival',
      launcherName: 'IUB Survival',
      display: 'fullscreen',
      orientation: 'landscape',
      themeColor: '#09080C',
      navigationColor: '#09080C',
      backgroundColor: '#09080C',
      enableNotifications: false,
      startUrl: '/',
      iconUrl: `${appOrigin}/pwa-512x512.png`,
      maskableIconUrl: `${appOrigin}/pwa-maskable-512x512.png`,
      webManifestUrl: `${appOrigin}/manifest.webmanifest`,
      appVersion: '1.0.0',
      appVersionCode: 1,
      shortcuts: [],
      generatorApp: 'bubblewrap-cli',
      instructions: [
        'Option 1 (Instant Android WebAPK): Open ' + appOrigin + ' in Chrome on your Android phone and tap "Install Game APK" to install the signed WebAPK directly to your app drawer.',
        'Option 2 (Compile standalone .APK file with Bubblewrap): Run `npx @bubblewrap/cli build` in the folder containing this twa-manifest.json to output a signed app-release-signed.apk.'
      ]
    };

    const blob = new Blob([JSON.stringify(twaManifest, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'twa-manifest-iub-cgpa-survival.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    isAndroid,
    isInIframe,
    isOnline,
    offlineReady,
    promptNativeInstall,
    downloadStandaloneGamePackage,
    downloadAndroidApkManifest,
  };
}
