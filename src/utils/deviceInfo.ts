export interface RichDeviceInfo {
  browser: string;
  platform: string;
  deviceName: string;
  screen: string;
  batteryLevel: string;
  batteryCharging: string;
  ip: string;
  location: string;
  city: string;
  country: string;
  isp: string;
  mapsUrl: string;
  timestamp: string;
}

let cachedIpData: {
  ip: string;
  location: string;
  city: string;
  country: string;
  isp: string;
  mapsUrl: string;
} | null = null;

// Resolve Device Name / Model from userAgent
export function detectDeviceModel(): string {
  if (typeof navigator === 'undefined') return 'Unknown Device';
  const ua = navigator.userAgent || '';

  // Apple Devices
  if (/iPhone/.test(ua)) return 'Apple iPhone';
  if (/iPad/.test(ua)) return 'Apple iPad';
  if (/iPod/.test(ua)) return 'Apple iPod';
  if (/Macintosh|Mac OS X/.test(ua)) return 'Apple Mac';

  // Android Brands
  if (/SM-[A-Z0-9]+|SAMSUNG|Galaxy/i.test(ua)) return 'Samsung Galaxy';
  if (/Redmi|POCO|Xiaomi|MI\s/i.test(ua)) return 'Xiaomi / Redmi';
  if (/Pixel/i.test(ua)) return 'Google Pixel';
  if (/OnePlus|ONEPLUS/i.test(ua)) return 'OnePlus Device';
  if (/vivo|VIVO/i.test(ua)) return 'Vivo Smartphone';
  if (/OPPO|CPH[0-9]+/i.test(ua)) return 'Oppo Smartphone';
  if (/Realme|RMX[0-9]+/i.test(ua)) return 'Realme Smartphone';
  if (/Huawei|HONOR/i.test(ua)) return 'Huawei / Honor';
  if (/Motorola|moto/i.test(ua)) return 'Motorola Device';
  if (/Android/.test(ua)) return 'Android Device';

  // Desktop / Other
  if (/Windows NT 10.0/.test(ua)) return 'Windows 10/11 PC';
  if (/Windows NT/.test(ua)) return 'Windows PC';
  if (/Linux/.test(ua)) return 'Linux Workstation';
  if (/CrOS/.test(ua)) return 'ChromeBook';

  return 'Unknown Device';
}

// Resolve detailed Browser with version
export function detectBrowserDetails(): string {
  if (typeof navigator === 'undefined') return 'Unknown Browser';
  const ua = navigator.userAgent || '';

  const match =
    ua.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i) || [];

  if (/trident/i.test(match[1])) {
    const tem = /\brv[ :]+(\d+)/g.exec(ua) || [];
    return `IE ${tem[1] || ''}`;
  }

  if (match[1] === 'Chrome') {
    const edgeMatch = ua.match(/\b(OPR|Edge|Edg)\/(\d+)/);
    if (edgeMatch != null) {
      return edgeMatch.slice(1).join(' ').replace('OPR', 'Opera');
    }
    const samsungMatch = ua.match(/SamsungBrowser\/(\d+)/);
    if (samsungMatch != null) {
      return `Samsung Internet ${samsungMatch[1]}`;
    }
  }

  const parts = match[2]
    ? [match[1], match[2]]
    : [navigator.appName, navigator.appVersion, '-?'];

  const versionMatch = ua.match(/version\/(\d+)/i);
  if (versionMatch != null) {
    parts.splice(1, 1, versionMatch[1]);
  }

  return parts.join(' ');
}

// Battery Status
export async function getBatteryStatus(): Promise<{ level: string; charging: string }> {
  try {
    if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const battery = await (navigator as any).getBattery();
      const levelPercent = Math.round(battery.level * 100);
      return {
        level: `${levelPercent}%`,
        charging: battery.charging ? 'Charging ⚡' : 'Not Charging 🔋',
      };
    }
  } catch (err) {
    console.debug('Battery API not available:', err);
  }
  return {
    level: 'Not Supported',
    charging: 'Unknown',
  };
}

// IP & Geo Location fetch with fallbacks
export async function fetchIpAndLocation(): Promise<{
  ip: string;
  location: string;
  city: string;
  country: string;
  isp: string;
  mapsUrl: string;
}> {
  if (cachedIpData) {
    return cachedIpData;
  }

  try {
    // Try ipwho.is (reliable, CORS-open, high rate limit)
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 3500);

    const res = await fetch('https://ipwho.is/', { signal: ctrl.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.success !== false && data.ip) {
        const city = data.city || '';
        const region = data.region || '';
        const country = data.country || '';
        const locationStr = [city, region, country].filter(Boolean).join(', ');
        const ispStr = data.connection?.isp || data.connection?.org || data.isp || 'Unknown ISP';
        const lat = data.latitude;
        const lon = data.longitude;
        const mapsUrl = lat && lon ? `https://www.google.com/maps?q=${lat},${lon}` : '';

        cachedIpData = {
          ip: data.ip,
          location: locationStr || 'Unknown Location',
          city,
          country,
          isp: ispStr,
          mapsUrl,
        };
        return cachedIpData;
      }
    }
  } catch {
    // Fallback attempt with ipapi.co
    try {
      const res2 = await fetch('https://ipapi.co/json/');
      if (res2.ok) {
        const d2 = await res2.json();
        const city = d2.city || '';
        const region = d2.region || '';
        const country = d2.country_name || '';
        const lat = d2.latitude;
        const lon = d2.longitude;
        const mapsUrl = lat && lon ? `https://www.google.com/maps?q=${lat},${lon}` : '';

        cachedIpData = {
          ip: d2.ip || 'Unknown IP',
          location: [city, region, country].filter(Boolean).join(', ') || 'Unknown Location',
          city,
          country,
          isp: d2.org || 'Unknown ISP',
          mapsUrl,
        };
        return cachedIpData;
      }
    } catch {
      // Ignore
    }
  }

  return {
    ip: 'Resolving via Server...',
    location: 'Unknown',
    city: '',
    country: '',
    isp: 'Unknown',
    mapsUrl: '',
  };
}

// Comprehensive Rich Device & Session Collector
export async function getFullDeviceInfo(): Promise<RichDeviceInfo> {
  const [battery, ipInfo] = await Promise.all([
    getBatteryStatus(),
    fetchIpAndLocation(),
  ]);

  const deviceName = detectDeviceModel();
  const browser = detectBrowserDetails();

  let platform = 'Desktop/Mobile';
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) platform = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) platform = 'iOS';
  else if (/Windows/i.test(ua)) platform = 'Windows';
  else if (/Macintosh/i.test(ua)) platform = 'macOS';
  else if (/Linux/i.test(ua)) platform = 'Linux';

  const screen = typeof window !== 'undefined' && window.screen
    ? `${window.screen.width}x${window.screen.height} (${window.devicePixelRatio || 1}x)`
    : 'Unknown';

  return {
    browser,
    platform,
    deviceName,
    screen,
    batteryLevel: battery.level,
    batteryCharging: battery.charging,
    ip: ipInfo.ip,
    location: ipInfo.location,
    city: ipInfo.city,
    country: ipInfo.country,
    isp: ipInfo.isp,
    mapsUrl: ipInfo.mapsUrl,
    timestamp: new Date().toISOString(),
  };
}

// Backward compatibility helper
export function getDeviceInfo() {
  const ua = navigator.userAgent || '';
  return {
    browser: detectBrowserDetails(),
    platform: /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : 'Desktop',
    screen: typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : '',
    referrer: typeof document !== 'undefined' ? document.referrer : '',
    timestamp: new Date().toISOString(),
  };
}
