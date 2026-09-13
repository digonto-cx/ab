export interface CollectedDeviceInfo {
  browser: string;
  platform: string;
  screen: string;
  referrer: string;
  timestamp: string;
}

export function getDeviceInfo(): CollectedDeviceInfo {
  const userAgent = navigator.userAgent || '';
  
  // Clean browser detection without collecting sensitive data
  let browser = 'Unknown Browser';
  if (userAgent.includes('Firefox/')) {
    browser = 'Mozilla Firefox';
  } else if (userAgent.includes('Edg/')) {
    browser = 'Microsoft Edge';
  } else if (userAgent.includes('Chrome/')) {
    browser = 'Google Chrome';
  } else if (userAgent.includes('Safari/') && !userAgent.includes('Chrome/')) {
    browser = 'Apple Safari';
  } else if (userAgent.includes('Opera') || userAgent.includes('OPR/')) {
    browser = 'Opera';
  }

  // Clean platform detection
  let platform = 'Desktop/Mobile';
  if (/iPhone|iPad|iPod/.test(userAgent)) {
    platform = 'iOS';
  } else if (/Android/.test(userAgent)) {
    platform = 'Android';
  } else if (/Macintosh|Mac OS X/.test(userAgent)) {
    platform = 'macOS';
  } else if (/Windows/.test(userAgent)) {
    platform = 'Windows';
  } else if (/Linux/.test(userAgent)) {
    platform = 'Linux';
  }

  // Screen resolution
  const screenResolution = typeof window !== 'undefined' && window.screen 
    ? `${window.screen.width}x${window.screen.height} (${window.devicePixelRatio || 1}x)`
    : 'Unknown';

  // Referrer (or Direct)
  const referrer = typeof document !== 'undefined' && document.referrer 
    ? document.referrer 
    : 'Direct Navigation';

  return {
    browser,
    platform,
    screen: screenResolution,
    referrer: referrer.slice(0, 150),
    timestamp: new Date().toISOString(),
  };
}
