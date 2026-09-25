import { LocationInfo, WeatherCondition, HourlyForecast, DailyForecast } from '../types';

export const DEFAULT_WISCONSIN_PRESETS: LocationInfo[] = [
  { name: 'West Bend', region: 'WI', country: 'United States', lat: 43.4253, lng: -88.1834 },
  { name: 'Campbellsport', region: 'WI', country: 'United States', lat: 43.6067, lng: -88.2773 },
  { name: 'Fond du Lac', region: 'WI', country: 'United States', lat: 43.7730, lng: -88.4471 },
  { name: 'Milwaukee', region: 'WI', country: 'United States', lat: 43.0389, lng: -87.9065 },
  { name: 'Sheboygan', region: 'WI', country: 'United States', lat: 43.7508, lng: -87.7145 },
  { name: 'Waukesha', region: 'WI', country: 'United States', lat: 43.0117, lng: -88.2315 },
  { name: 'Plymouth', region: 'WI', country: 'United States', lat: 43.7486, lng: -87.9773 },
];

export async function searchLocations(query: string): Promise<LocationInfo[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery || cleanQuery.length < 2) return [];

  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cleanQuery)}&count=10&language=en&format=json`
    );
    if (!res.ok) throw new Error('Geocoding request failed');
    const data = await res.json();
    if (!data.results || data.results.length === 0) return [];

    return data.results.map((item: any) => ({
      name: item.name,
      region: item.admin1 || item.admin2 || item.country_code || '',
      country: item.country || '',
      lat: item.latitude,
      lng: item.longitude,
      isGps: false,
    }));
  } catch (error) {
    console.error('Location search error:', error);
    return [];
  }
}

export function getCurrentGpsPosition(): Promise<LocationInfo> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser or device.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        let detectedName = 'Current Location';
        let region = '';

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4000);
          const revRes = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
            { signal: controller.signal }
          );
          clearTimeout(timeoutId);

          if (revRes.ok) {
            const revData = await revRes.json();
            const addr = revData.address;
            if (addr) {
              const town =
                addr.city || addr.town || addr.village || addr.hamlet || addr.suburb || addr.county || 'Local Area';
              const state = addr.state || 'WI';
              detectedName = town;
              region = state;
            }
          }
        } catch {
          detectedName = `Current Location (${lat.toFixed(2)}°, ${lng.toFixed(2)}°)`;
        }

        resolve({
          name: detectedName,
          region: region || undefined,
          lat,
          lng,
          isGps: true,
        });
      },
      (error) => {
        let msg = 'Unable to access your device location.';
        if (error.code === error.PERMISSION_DENIED) {
          msg = 'Location permission was denied. Please allow location access in your browser or search for a city.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          msg = 'Device location is currently unavailable.';
        } else if (error.code === error.TIMEOUT) {
          msg = 'Device location request timed out.';
        }
        reject(new Error(msg));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  });
}

/**
 * Actively watches and follows the user's device location in real-time.
 * Calls onUpdate with location data whenever user moves.
 */
export function watchDeviceLocation(
  onUpdate: (loc: LocationInfo) => void,
  onError?: (err: Error) => void
): () => void {
  if (!navigator.geolocation) {
    if (onError) onError(new Error('Geolocation not supported on this device.'));
    return () => {};
  }

  let lastLat = 0;
  let lastLng = 0;

  const watchId = navigator.geolocation.watchPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      // Only re-geocode if moved by more than ~200 meters
      const movedDist = Math.hypot(lat - lastLat, lng - lastLng);
      if (movedDist < 0.002 && lastLat !== 0) {
        return;
      }
      lastLat = lat;
      lastLng = lng;

      let detectedName = 'Live Location';
      let region = 'WI';

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const revRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
          { signal: controller.signal }
        );
        clearTimeout(timeoutId);

        if (revRes.ok) {
          const revData = await revRes.json();
          const addr = revData.address;
          if (addr) {
            detectedName =
              addr.city || addr.town || addr.village || addr.hamlet || addr.suburb || addr.county || 'Local Area';
            region = addr.state || 'WI';
          }
        }
      } catch {
        detectedName = `Current Location (${lat.toFixed(2)}°, ${lng.toFixed(2)}°)`;
      }

      onUpdate({
        name: detectedName,
        region,
        lat,
        lng,
        isGps: true,
      });
    },
    (err) => {
      if (onError) onError(new Error(err.message || 'GPS location tracking unavailable.'));
    },
    { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
  );

  return () => {
    navigator.geolocation.clearWatch(watchId);
  };
}

export async function fetchFullWeather(lat: number, lng: number): Promise<{
  current: WeatherCondition;
  hourly: HourlyForecast[];
  daily: DailyForecast[];
}> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation,weather_code&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch weather data');
  const data = await res.json();

  const curTemp = Math.round(data.current?.temperature_2m ?? 0);
  const curHum = Math.round(data.current?.relative_humidity_2m ?? 0);
  const curWind = Math.round(data.current?.wind_speed_10m ?? 0);
  const curPrecip = data.current?.precipitation ?? 0;
  const weatherCode = data.current?.weather_code ?? 0;

  const todayRainProb =
    data.daily?.precipitation_probability_max && data.daily.precipitation_probability_max.length > 0
      ? data.daily.precipitation_probability_max[0]
      : 0;

  let condText = '🟢 Ideal Spray & Roll Conditions';
  let badgeBg = '#30d158';
  let badgeText = 'Great';
  let advice = '🟢 Favorable atmospheric conditions for interior prep and exterior coating application.';

  if (curPrecip > 0.0) {
    condText = '🔴 Active Rain — Outdoor Painting Halted';
    badgeBg = '#ff453a';
    badgeText = 'Rain';
    advice = '⛔ Active precipitation! Stop all exterior spraying and unshielded coating.';
  } else if (todayRainProb >= 40) {
    condText = `🌧️ Rain Risk (${todayRainProb}%) — Watch Windows`;
    badgeBg = '#ff453a';
    badgeText = 'Rain Risk';
    advice = `⚠️ High precipitation probability (${todayRainProb}%) today. Verify cure windows before applying exterior paint.`;
  } else if (curWind > 15) {
    condText = `💨 High Winds (${curWind} mph) — Overspray Drift`;
    badgeBg = '#f59e0b';
    badgeText = 'Windy';
    advice = '⚠️ High winds! Significant risk of paint overspray drift on vehicles and neighboring siding.';
  } else if (curHum > 85) {
    condText = `💧 High Humidity (${curHum}%) — Slow Cure`;
    badgeBg = '#f59e0b';
    badgeText = 'Humid';
    advice = '⚠️ Relative humidity exceeds 85%. Waterborne latex coatings will take substantially longer to cure.';
  } else if (curTemp < 45) {
    condText = `❄️ Low Temp (${curTemp}°F) — Check Specs`;
    badgeBg = '#0a84ff';
    badgeText = 'Cold';
    advice = '⚠️ Air temperature below 45°F. Confirm minimum application specs for your exterior paint.';
  }

  // Hourly forecast
  const hourlyList: HourlyForecast[] = [];
  if (data.hourly?.time) {
    const currentHour = new Date().getHours();
    for (let i = currentHour; i < currentHour + 20; i++) {
      if (!data.hourly.time[i]) break;
      const d = new Date(data.hourly.time[i]);
      const timeStr = d.toLocaleTimeString([], { hour: 'numeric', hour12: true });
      hourlyList.push({
        timeStr,
        temp: Math.round(data.hourly.temperature_2m[i] ?? 0),
        rainProb: data.hourly.precipitation_probability[i] ?? 0,
        windSpeed: Math.round(data.hourly.wind_speed_10m[i] ?? 0),
      });
    }
  }

  // 7-day outlook
  const dailyList: DailyForecast[] = [];
  if (data.daily?.time) {
    for (let d = 0; d < data.daily.time.length; d++) {
      const dateStr = data.daily.time[d];
      const dObj = new Date(dateStr + 'T00:00:00');
      const dayName =
        d === 0 ? 'Today' : dObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      dailyList.push({
        dateStr,
        dayName,
        tempMax: Math.round(data.daily.temperature_2m_max[d] ?? 0),
        tempMin: Math.round(data.daily.temperature_2m_min[d] ?? 0),
        rainProb: data.daily.precipitation_probability_max[d] ?? 0,
        weatherCode: data.daily.weather_code[d] ?? 0,
      });
    }
  }

  return {
    current: {
      temp: curTemp,
      humidity: curHum,
      windSpeed: curWind,
      precipitation: curPrecip,
      weatherCode,
      rainProb: todayRainProb,
      conditionText: condText,
      badgeBg,
      badgeText,
      advice,
    },
    hourly: hourlyList,
    daily: dailyList,
  };
}
