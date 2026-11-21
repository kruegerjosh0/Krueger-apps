import {
  LocationInfo,
  WeatherCondition,
  HourlyForecast,
  DailyForecast,
  PrecipType,
  WorkabilityStatus,
  WinterOutlookSummary,
  WinterAdvisoryItem,
  RegionalWeatherSnapshot,
} from '../types';

export const DEFAULT_WISCONSIN_PRESETS: LocationInfo[] = [
  { name: 'West Bend', region: 'Washington County, WI', country: 'United States', lat: 43.4253, lng: -88.1834 },
  { name: 'Hartford', region: 'Washington County, WI', country: 'United States', lat: 43.3178, lng: -88.3787 },
  { name: 'Campbellsport', region: 'Fond du Lac County, WI', country: 'United States', lat: 43.6067, lng: -88.2773 },
  { name: 'Cedarburg', region: 'Ozaukee County, WI', country: 'United States', lat: 43.2967, lng: -87.9876 },
  { name: 'Jackson', region: 'Washington County, WI', country: 'United States', lat: 43.3247, lng: -88.1695 },
  { name: 'Fond du Lac', region: 'WI', country: 'United States', lat: 43.7730, lng: -88.4471 },
  { name: 'Waukesha', region: 'WI', country: 'United States', lat: 43.0117, lng: -88.2315 },
  { name: 'Milwaukee', region: 'WI', country: 'United States', lat: 43.0389, lng: -87.9065 },
  { name: 'Sheboygan', region: 'WI', country: 'United States', lat: 43.7508, lng: -87.7145 },
];

export interface FullWeatherResponse {
  current: WeatherCondition;
  hourly: HourlyForecast[];
  daily: DailyForecast[];
  winterOutlook: WinterOutlookSummary;
  fetchedAt: string;
}

/**
 * Normalizes Open-Meteo snowfall/precipitation measurements into inches.
 * Open-Meteo returns `snowfall` / `snowfall_sum` in inches when `precipitation_unit=inch`
 * on newer builds, or in centimeters on older/default unit endpoints. Checking `*_units`
 * guarantees accurate inches in all cases.
 */
function normalizeToInches(value: number | null | undefined, unit?: string): number {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num) || num <= 0) return 0;
  const u = (unit || '').toLowerCase().trim();
  if (u === 'cm') return num / 2.54;
  if (u === 'mm') return num / 25.4;
  return num;
}

function roundInches(val: number): number {
  return Math.round(val * 10) / 10;
}

export function formatInches(val: number): string {
  if (val <= 0) return '0.0"';
  if (val < 0.1) return '<0.1"';
  return `${val.toFixed(1)}"`;
}

export function describeWmoCode(code: number): string {
  switch (code) {
    case 0: return 'Clear Sky';
    case 1: return 'Mostly Clear';
    case 2: return 'Partly Cloudy';
    case 3: return 'Overcast';
    case 45: return 'Fog';
    case 48: return 'Freezing Rime Fog';
    case 51: return 'Light Drizzle';
    case 53: return 'Drizzle';
    case 55: return 'Heavy Drizzle';
    case 56: return 'Light Freezing Drizzle';
    case 57: return 'Freezing Drizzle';
    case 61: return 'Light Rain';
    case 63: return 'Moderate Rain';
    case 65: return 'Heavy Rain';
    case 66: return 'Light Freezing Rain';
    case 67: return 'Freezing Rain';
    case 71: return 'Light Snow';
    case 73: return 'Moderate Snow';
    case 75: return 'Heavy Snow';
    case 77: return 'Snow Grains';
    case 80: return 'Rain Showers';
    case 81: return 'Heavy Rain Showers';
    case 82: return 'Violent Rain Showers';
    case 85: return 'Snow Showers';
    case 86: return 'Heavy Snow Showers';
    case 95: return 'Thunderstorm';
    case 96: return 'Thunderstorm & Hail';
    case 99: return 'Severe Thunderstorm';
    default: return 'Mixed Conditions';
  }
}

export function classifyPrecipType(
  weatherCode: number,
  tempF: number,
  snowfallIn: number,
  rainIn: number,
  precipProb: number
): { type: PrecipType; label: string; icon: string } {
  // Freezing rain / freezing drizzle / freezing fog
  if (weatherCode === 56 || weatherCode === 57 || weatherCode === 66 || weatherCode === 67) {
    return { type: 'FREEZING_RAIN', label: 'Freezing Rain / Ice', icon: '🧊' };
  }

  // Explicit snow WMO codes
  if (
    weatherCode === 71 ||
    weatherCode === 73 ||
    weatherCode === 75 ||
    weatherCode === 77 ||
    weatherCode === 85 ||
    weatherCode === 86
  ) {
    if (rainIn >= 0.04 && snowfallIn > 0 && tempF >= 33) {
      return { type: 'WINTRY_MIX', label: 'Snow / Rain Mix', icon: '🌨️' };
    }
    return { type: 'SNOW', label: 'Snow', icon: '❄️' };
  }

  // Quantitative snowfall + rain mix
  if (snowfallIn >= 0.05 && rainIn >= 0.04) {
    return { type: 'WINTRY_MIX', label: 'Wintry Mix', icon: '🌨️' };
  }
  if (snowfallIn >= 0.05) {
    return { type: 'SNOW', label: 'Snow', icon: '❄️' };
  }
  if (rainIn >= 0.03 && tempF <= 32) {
    return { type: 'FREEZING_RAIN', label: 'Freezing Rain / Ice', icon: '🧊' };
  }

  // Liquid rain codes
  if (
    (weatherCode >= 51 && weatherCode <= 55) ||
    (weatherCode >= 61 && weatherCode <= 65) ||
    (weatherCode >= 80 && weatherCode <= 82) ||
    weatherCode >= 95
  ) {
    if (tempF <= 32) {
      return { type: 'FREEZING_RAIN', label: 'Freezing Rain / Ice', icon: '🧊' };
    }
    if (tempF <= 35) {
      return { type: 'WINTRY_MIX', label: 'Wintry Mix', icon: '🌨️' };
    }
    return { type: 'RAIN', label: 'Rain', icon: '🌧️' };
  }

  // Probability-based forecast classification when no quantitative precip yet
  if (precipProb >= 25) {
    if (tempF <= 31) {
      return { type: 'SNOW', label: 'Snow Chance', icon: '❄️' };
    }
    if (tempF <= 36) {
      return { type: 'WINTRY_MIX', label: 'Wintry Mix', icon: '🌨️' };
    }
    return { type: 'RAIN', label: 'Rain', icon: '🌧️' };
  }

  if (weatherCode === 45 || weatherCode === 48) {
    return { type: 'NONE', label: weatherCode === 48 ? 'Freezing Fog' : 'Fog', icon: '🌫️' };
  }
  if (weatherCode === 0 || weatherCode === 1) {
    return { type: 'NONE', label: 'Clear / Dry', icon: '☀️' };
  }
  return { type: 'NONE', label: 'Dry / Cloudy', icon: '⛅' };
}

export function evaluateDayWorkability(params: {
  tempMax: number;
  tempMin: number;
  feelsLikeMin: number;
  snowfallIn: number;
  precipProb: number;
  precipType: PrecipType;
  windSpeedMax: number;
  windGustsMax: number;
  weatherCode: number;
}): { status: WorkabilityStatus; label: string; hint: string } {
  const {
    tempMax,
    tempMin,
    feelsLikeMin,
    snowfallIn,
    precipProb,
    precipType,
    windSpeedMax,
    windGustsMax,
    weatherCode,
  } = params;

  // High-priority Snow / Ice / Travel Risk
  if (precipType === 'FREEZING_RAIN' || weatherCode === 48) {
    return {
      status: 'SNOW_ICE_RISK',
      label: 'Snow/Ice Risk',
      hint: 'Icy roads & freezing precip — prioritize heated interior jobs & allow extra travel time.',
    };
  }
  if (snowfallIn >= 0.5 || (precipType === 'SNOW' && precipProb >= 50)) {
    return {
      status: 'SNOW_ICE_RISK',
      label: 'Snow/Ice Risk',
      hint:
        snowfallIn >= 2.0
          ? `Accumulating snow (~${snowfallIn.toFixed(1)}") — slick travel & plowing likely; interior work only.`
          : 'Snowfall & slick roads likely — keep paint warm in vehicle & stick to heated interior work.',
    };
  }
  if (precipType === 'WINTRY_MIX' && precipProb >= 45) {
    return {
      status: 'SNOW_ICE_RISK',
      label: 'Snow/Ice Risk',
      hint: 'Wintry mix & slush risk — monitor road freeze-ups and skip exterior prep.',
    };
  }
  if (feelsLikeMin <= 5) {
    return {
      status: 'SNOW_ICE_RISK',
      label: 'Snow/Ice Risk',
      hint: `Bitter wind chill (${feelsLikeMin}°F) — freeze hazard for waterborne paint in van & unheated spaces.`,
    };
  }

  // Cold / Wind / Exterior Threshold Caution (below 40°F/35°F exterior cutoff or freezing lows or high gusts)
  if (tempMax < 35 || tempMin <= 32) {
    return {
      status: 'CAUTION',
      label: 'Caution - Cold/Wind',
      hint:
        tempMax < 35
          ? 'Below 35°F all day — no exterior coatings; heat unheated spaces & guard latex paint from freezing.'
          : 'Overnight freeze (≤32°F) — verify 24h cure temps for exterior work; safe for heated interiors.',
    };
  }
  if (tempMax < 40) {
    return {
      status: 'CAUTION',
      label: 'Caution - Cold/Wind',
      hint: 'Highs below 40°F — too cold for standard exterior latex; ideal for interior scheduling.',
    };
  }
  if (windGustsMax >= 25 || windSpeedMax >= 18) {
    return {
      status: 'CAUTION',
      label: 'Caution - Cold/Wind',
      hint: `Strong gusts (${windGustsMax} mph) — avoid exterior spraying and secure ladders/drop cloths.`,
    };
  }
  if (snowfallIn > 0 || (precipType === 'RAIN' && precipProb >= 40)) {
    return {
      status: 'CAUTION',
      label: 'Caution - Cold/Wind',
      hint: 'Wet weather window — plan interior rooms or verify dry cure window.',
    };
  }

  return {
    status: 'GO',
    label: 'Go',
    hint: 'Favorable travel & working temps for interior or cold-rated exterior coatings.',
  };
}

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
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
            { signal: controller.signal }
          );
          clearTimeout(timeoutId);

          if (revRes.ok) {
            const revData = await revRes.json();
            if (revData.city || revData.locality) {
              detectedName = revData.city || revData.locality || 'Local Area';
              region = revData.principalSubdivision || 'WI';
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
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
          { signal: controller.signal }
        );
        clearTimeout(timeoutId);

        if (revRes.ok) {
          const revData = await revRes.json();
          if (revData.city || revData.locality) {
            detectedName = revData.city || revData.locality || 'Local Area';
            region = revData.principalSubdivision || 'WI';
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

function findCurrentHourIndex(hourlyTimes: string[], currentIso?: string): number {
  if (!hourlyTimes || hourlyTimes.length === 0) return 0;
  if (currentIso) {
    const prefix = currentIso.slice(0, 13); // YYYY-MM-DDTHH
    const exactIdx = hourlyTimes.findIndex((t) => t.startsWith(prefix));
    if (exactIdx !== -1) return exactIdx;
  }
  const nowHour = new Date().getHours();
  return Math.min(nowHour, Math.max(0, hourlyTimes.length - 1));
}

function buildWinterOutlook(
  hourly48: HourlyForecast[],
  daily: DailyForecast[]
): WinterOutlookSummary {
  const snow48hRaw = hourly48.reduce((sum, h) => sum + (h.snowfallIn || 0), 0);
  const first7Days = daily.slice(0, 7);
  const snow7dRaw = first7Days.reduce((sum, d) => sum + (d.snowfallIn || 0), 0);
  const snow10dRaw = daily.reduce((sum, d) => sum + (d.snowfallIn || 0), 0);

  const snow48hIn = roundInches(snow48hRaw);
  const snow7dIn = roundInches(snow7dRaw);
  const snow10dIn = roundInches(snow10dRaw);

  const snowDays7d = first7Days.filter(
    (d) => d.snowfallIn >= 0.1 || d.precipType === 'SNOW' || d.precipType === 'WINTRY_MIX'
  );
  const hasFreezingRainRisk =
    first7Days.some((d) => d.precipType === 'FREEZING_RAIN') ||
    hourly48.some((h) => h.precipType === 'FREEZING_RAIN');

  const lowestTemp7d = first7Days.length > 0 ? Math.min(...first7Days.map((d) => d.tempMin)) : 32;
  const lowestFeelsLike7d =
    first7Days.length > 0 ? Math.min(...first7Days.map((d) => d.feelsLikeMin)) : 32;
  const peakGust7d =
    first7Days.length > 0 ? Math.max(...first7Days.map((d) => d.windGustsMax)) : 0;
  const freezingNights7d = first7Days.filter((d) => d.tempMin <= 32).length;

  const nextSnowDay = first7Days.find(
    (d) =>
      d.snowfallIn >= 0.1 ||
      d.precipType === 'SNOW' ||
      d.precipType === 'WINTRY_MIX' ||
      d.precipType === 'FREEZING_RAIN'
  );

  const nextSnowEvent = nextSnowDay
    ? {
        dayName: nextSnowDay.dayName,
        snowfallIn: nextSnowDay.snowfallIn,
        precipProb: nextSnowDay.rainProb,
        windGustsMax: nextSnowDay.windGustsMax,
        precipTypeLabel: nextSnowDay.precipTypeLabel,
      }
    : undefined;

  let severity: WinterOutlookSummary['severity'] = 'CLEAR';
  let headline = 'Clear Winter Outlook — Low Snow & Ice Risk';

  if (snow48hIn >= 4.0 || snow7dIn >= 6.0 || hasFreezingRainRisk) {
    severity = 'STORM_ALERT';
    headline = hasFreezingRainRisk
      ? 'Freezing Rain & Icy Travel Alert'
      : `Winter Storm Watch — ${formatInches(Math.max(snow48hIn, snow7dIn))} Snow Projected`;
  } else if (snow48hIn >= 0.5 || snow7dIn >= 1.0 || snowDays7d.length > 0) {
    severity = 'ADVISORY';
    headline = `Snow & Slick Travel Advisory — ${formatInches(snow7dIn)} Over 7 Days`;
  } else if (lowestTemp7d <= 25 || lowestFeelsLike7d <= 15 || freezingNights7d >= 3) {
    severity = 'COLD_WATCH';
    headline = `Cold Snap & Freeze Watch — Lows to ${lowestTemp7d}°F (Feels ${lowestFeelsLike7d}°F)`;
  }

  const advisories: WinterAdvisoryItem[] = [];

  if (hasFreezingRainRisk) {
    advisories.push({
      icon: '🧊',
      title: 'Icy Roads & Freezing Precip Risk',
      detail:
        'Freezing rain or glazing possible in the 7-day window. Allow extra drive time and watch untreated driveways & steps.',
      tone: 'danger',
    });
  }

  if (nextSnowEvent) {
    advisories.push({
      icon: '❄️',
      title: `Next Winter Event: ${nextSnowEvent.dayName}`,
      detail: `${nextSnowEvent.precipTypeLabel} (${nextSnowEvent.precipProb}% chance)${
        nextSnowEvent.snowfallIn > 0 ? ` • ~${formatInches(nextSnowEvent.snowfallIn)} projected` : ''
      } • Gusts to ${nextSnowEvent.windGustsMax} mph.`,
      tone: nextSnowEvent.snowfallIn >= 2.0 ? 'danger' : 'warn',
    });
  } else {
    advisories.push({
      icon: '✅',
      title: 'No Accumulating Snow Next 7 Days',
      detail: 'Dry road outlook for scheduling interior jobs and supply runs.',
      tone: 'ok',
    });
  }

  if (lowestTemp7d <= 32) {
    advisories.push({
      icon: '🌡️',
      title:
        lowestFeelsLike7d <= 10
          ? `Bitter Cold & Freeze Alert (${lowestTemp7d}°F / Feels ${lowestFeelsLike7d}°F)`
          : `Freeze Drop (${lowestTemp7d}°F Low • ${freezingNights7d} Freezing Nights)`,
      detail:
        'Bring waterborne paint, primers, and caulk indoors overnight—never leave latex coatings in an unheated truck below 35°F.',
      tone: lowestFeelsLike7d <= 10 ? 'danger' : 'cold',
    });
  }

  if (peakGust7d >= 30) {
    advisories.push({
      icon: '💨',
      title: `High Wind Gusts Up to ${peakGust7d} mph`,
      detail:
        snow7dIn > 0
          ? 'Expect blowing/drifting snow on open rural highways (Hwy 45 / Hwy 33 / I-41).'
          : 'High gusts increase wind chill and ladder/overspray hazards.',
      tone: 'warn',
    });
  }

  return {
    snow48hIn,
    snow7dIn,
    snow10dIn,
    snowDaysCount7d: snowDays7d.length,
    lowestTemp7d,
    lowestFeelsLike7d,
    peakGust7d,
    freezingNights7d,
    hasFreezingRainRisk,
    severity,
    headline,
    advisories,
    nextSnowEvent,
  };
}

export async function fetchFullWeather(lat: number, lng: number): Promise<FullWeatherResponse> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,precipitation,rain,snowfall,weather_code` +
    `&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,rain,snowfall,wind_speed_10m,wind_gusts_10m,weather_code` +
    `&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,rain_sum,snowfall_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,weather_code` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=10`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch weather data from Open-Meteo');
  const data = await res.json();

  const curSnowUnit = data.current_units?.snowfall;
  const hourlySnowUnit = data.hourly_units?.snowfall;
  const dailySnowUnit = data.daily_units?.snowfall_sum;

  const curTemp = Math.round(data.current?.temperature_2m ?? 0);
  const curFeelsLike = Math.round(data.current?.apparent_temperature ?? curTemp);
  const curHum = Math.round(data.current?.relative_humidity_2m ?? 0);
  const curWind = Math.round(data.current?.wind_speed_10m ?? 0);
  const curGusts = Math.round(data.current?.wind_gusts_10m ?? curWind);
  const curPrecip = Number(data.current?.precipitation ?? 0);
  const curRain = Number(data.current?.rain ?? 0);
  const curSnowIn = roundInches(normalizeToInches(data.current?.snowfall, curSnowUnit));
  const weatherCode = Number(data.current?.weather_code ?? 0);
  const wmoDescription = describeWmoCode(weatherCode);

  const todayRainProb =
    data.daily?.precipitation_probability_max && data.daily.precipitation_probability_max.length > 0
      ? Math.round(data.daily.precipitation_probability_max[0] ?? 0)
      : 0;

  const curPrecipClass = classifyPrecipType(
    weatherCode,
    curTemp,
    curSnowIn,
    curRain,
    todayRainProb
  );

  // Build 48-hour hourly forecast from current local hour
  const hourlyList: HourlyForecast[] = [];
  if (data.hourly?.time) {
    const startIdx = findCurrentHourIndex(data.hourly.time, data.current?.time);
    const todayDateStr = (data.daily?.time?.[0] || '').slice(0, 10);

    for (let i = startIdx; i < startIdx + 48; i++) {
      const isoTime = data.hourly.time[i];
      if (!isoTime) break;

      const d = new Date(isoTime);
      const timeStr = d.toLocaleTimeString([], { hour: 'numeric', hour12: true });
      const datePart = isoTime.slice(0, 10);
      const dayLabel =
        datePart === todayDateStr
          ? 'Today'
          : d.toLocaleDateString('en-US', { weekday: 'short' });

      const hTemp = Math.round(data.hourly.temperature_2m?.[i] ?? 0);
      const hFeels = Math.round(data.hourly.apparent_temperature?.[i] ?? hTemp);
      const hProb = Math.round(data.hourly.precipitation_probability?.[i] ?? 0);
      const hWind = Math.round(data.hourly.wind_speed_10m?.[i] ?? 0);
      const hGust = Math.round(data.hourly.wind_gusts_10m?.[i] ?? hWind);
      const hSnow = roundInches(normalizeToInches(data.hourly.snowfall?.[i], hourlySnowUnit));
      const hPrecip = Number(data.hourly.precipitation?.[i] ?? 0);
      const hRain = Number(data.hourly.rain?.[i] ?? 0);
      const hCode = Number(data.hourly.weather_code?.[i] ?? 0);
      const hClass = classifyPrecipType(hCode, hTemp, hSnow, hRain, hProb);

      hourlyList.push({
        isoTime,
        dayLabel,
        timeStr,
        temp: hTemp,
        feelsLike: hFeels,
        rainProb: hProb,
        windSpeed: hWind,
        windGusts: hGust,
        snowfallIn: hSnow,
        precipIn: hPrecip,
        weatherCode: hCode,
        precipType: hClass.type,
        precipIcon: hClass.icon,
      });
    }
  }

  // Build 10-day outlook
  const dailyList: DailyForecast[] = [];
  if (data.daily?.time) {
    for (let d = 0; d < data.daily.time.length; d++) {
      const dateStr = data.daily.time[d];
      const dObj = new Date(dateStr + 'T00:00:00');
      const dayName =
        d === 0
          ? 'Today'
          : d === 1
          ? `Tomorrow (${dObj.toLocaleDateString('en-US', { weekday: 'short' })})`
          : dObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

      const tempMax = Math.round(data.daily.temperature_2m_max?.[d] ?? 0);
      const tempMin = Math.round(data.daily.temperature_2m_min?.[d] ?? 0);
      const feelsLikeMax = Math.round(data.daily.apparent_temperature_max?.[d] ?? tempMax);
      const feelsLikeMin = Math.round(data.daily.apparent_temperature_min?.[d] ?? tempMin);
      const rainProb = Math.round(data.daily.precipitation_probability_max?.[d] ?? 0);
      const snowfallIn = roundInches(normalizeToInches(data.daily.snowfall_sum?.[d], dailySnowUnit));
      const precipSumIn = roundInches(Number(data.daily.precipitation_sum?.[d] ?? 0));
      const rainSumIn = Number(data.daily.rain_sum?.[d] ?? 0);
      const windSpeedMax = Math.round(data.daily.wind_speed_10m_max?.[d] ?? 0);
      const windGustsMax = Math.round(data.daily.wind_gusts_10m_max?.[d] ?? windSpeedMax);
      const dCode = Number(data.daily.weather_code?.[d] ?? 0);
      const dDesc = describeWmoCode(dCode);

      // Use daytime/avg temp for precip classification so sub-freezing nights don't falsely tag a 50°F rain day as snow
      const repTemp = Math.round((tempMax * 2 + tempMin) / 3);
      const dClass = classifyPrecipType(dCode, repTemp, snowfallIn, rainSumIn, rainProb);

      const workabilityEval = evaluateDayWorkability({
        tempMax,
        tempMin,
        feelsLikeMin,
        snowfallIn,
        precipProb: rainProb,
        precipType: dClass.type,
        windSpeedMax,
        windGustsMax,
        weatherCode: dCode,
      });

      dailyList.push({
        dateStr,
        dayName,
        tempMax,
        tempMin,
        feelsLikeMax,
        feelsLikeMin,
        rainProb,
        snowfallIn,
        precipSumIn,
        windSpeedMax,
        windGustsMax,
        weatherCode: dCode,
        wmoDescription: dDesc,
        precipType: dClass.type,
        precipTypeLabel: dClass.label,
        precipIcon: dClass.icon,
        workability: workabilityEval.status,
        workabilityLabel: workabilityEval.label,
        workabilityHint: workabilityEval.hint,
      });
    }
  }

  const winterOutlook = buildWinterOutlook(hourlyList, dailyList);

  // Current condition badge & contractor advisory (winter-first aware)
  let condText = `🟢 ${wmoDescription} — Good Working Conditions`;
  let badgeBg = '#30d158';
  let badgeText = 'Go';
  let workability: WorkabilityStatus = 'GO';
  let workabilityLabel = 'Go';
  let advice = '🟢 Clear conditions for travel, exterior prep, and interior job scheduling.';

  if (curPrecipClass.type === 'FREEZING_RAIN' || weatherCode === 48) {
    condText = `🧊 ${wmoDescription} (${curTemp}°F • Feels ${curFeelsLike}°F)`;
    badgeBg = '#ef4444';
    badgeText = 'Snow/Ice Risk';
    workability = 'SNOW_ICE_RISK';
    workabilityLabel = 'Snow/Ice Risk';
    advice =
      '⛔ Active freezing rain / ice hazard! Watch slick steps & roads; keep all work inside heated interiors.';
  } else if (curSnowIn > 0 || curPrecipClass.type === 'SNOW') {
    condText = `❄️ ${wmoDescription} (${curTemp}°F • Feels ${curFeelsLike}°F)`;
    badgeBg = '#ef4444';
    badgeText = 'Snow/Ice Risk';
    workability = 'SNOW_ICE_RISK';
    workabilityLabel = 'Snow/Ice Risk';
    advice =
      '❄️ Active snow conditions. Exterior work halted—allow extra travel time and keep paint warm indoors.';
  } else if (curPrecipClass.type === 'WINTRY_MIX') {
    condText = `🌨️ Wintry Mix (${curTemp}°F • Feels ${curFeelsLike}°F)`;
    badgeBg = '#ef4444';
    badgeText = 'Snow/Ice Risk';
    workability = 'SNOW_ICE_RISK';
    workabilityLabel = 'Snow/Ice Risk';
    advice = '🌨️ Rain/snow mix expected. Watch for slushy roads and skip unshielded exterior work.';
  } else if (curPrecip > 0) {
    condText = `🌧️ Active Rain (${curTemp}°F) — Outdoor Painting Halted`;
    badgeBg = '#f59e0b';
    badgeText = 'Caution - Wet';
    workability = 'CAUTION';
    workabilityLabel = 'Caution - Cold/Wind';
    advice = '⚠️ Active rain! Halt exterior spraying/coating and verify dry cure windows.';
  } else if (curTemp <= 32 || curFeelsLike <= 20) {
    condText = `🥶 Freezing (${curTemp}°F • Wind Chill ${curFeelsLike}°F)`;
    badgeBg = '#0ea5e9';
    badgeText = 'Caution - Cold/Wind';
    workability = 'CAUTION';
    workabilityLabel = 'Caution - Cold/Wind';
    advice =
      '❄️ Sub-freezing temps! No exterior latex application. Keep paint gallons inside heated spaces and out of cold vans.';
  } else if (curTemp < 40) {
    condText = `❄️ Cold (${curTemp}°F • Feels ${curFeelsLike}°F) — Interior Focus`;
    badgeBg = '#f59e0b';
    badgeText = 'Caution - Cold/Wind';
    workability = 'CAUTION';
    workabilityLabel = 'Caution - Cold/Wind';
    advice =
      '⚠️ Below 40°F threshold for standard exterior coatings. Ideal window to prioritize heated interior jobs.';
  } else if (curGusts >= 25 || curWind > 15) {
    condText = `💨 Gusty Winds (${curWind} mph, Gusts ${curGusts} mph)`;
    badgeBg = '#f59e0b';
    badgeText = 'Caution - Cold/Wind';
    workability = 'CAUTION';
    workabilityLabel = 'Caution - Cold/Wind';
    advice = `⚠️ Wind gusts reaching ${curGusts} mph — overspray drift and ladder stability risk.`;
  } else if (todayRainProb >= 40) {
    condText = `🌧️ Precip Risk (${todayRainProb}%) — Watch Windows`;
    badgeBg = '#f59e0b';
    badgeText = 'Caution - Cold/Wind';
    workability = 'CAUTION';
    workabilityLabel = 'Caution - Cold/Wind';
    advice = `⚠️ ${todayRainProb}% precipitation chance today. Confirm dry cure window before exterior coating.`;
  } else if (curHum > 85) {
    condText = `💧 High Humidity (${curHum}%) — Slow Cure`;
    badgeBg = '#f59e0b';
    badgeText = 'Caution - Humid';
    workability = 'CAUTION';
    workabilityLabel = 'Caution - Cold/Wind';
    advice = '⚠️ Relative humidity exceeds 85%. Waterborne coatings will take longer to cure.';
  }

  return {
    current: {
      temp: curTemp,
      feelsLike: curFeelsLike,
      humidity: curHum,
      windSpeed: curWind,
      windGusts: curGusts,
      precipitation: curPrecip,
      snowfallIn: curSnowIn,
      weatherCode,
      wmoDescription,
      rainProb: todayRainProb,
      precipType: curPrecipClass.type,
      precipTypeLabel: curPrecipClass.label,
      workability,
      workabilityLabel,
      conditionText: condText,
      badgeBg,
      badgeText,
      advice,
    },
    hourly: hourlyList,
    daily: dailyList,
    winterOutlook,
    fetchedAt: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
  };
}

/**
 * Fetches live winter conditions & 48h/7d snowfall totals for Southeast Wisconsin presets
 * in a single Open-Meteo multi-coordinate batch request (reliable, zero broken embeds).
 */
export async function fetchRegionalSeWiWeather(
  locations: LocationInfo[] = DEFAULT_WISCONSIN_PRESETS
): Promise<RegionalWeatherSnapshot[]> {
  if (locations.length === 0) return [];

  const lats = locations.map((l) => l.lat.toFixed(4)).join(',');
  const lngs = locations.map((l) => l.lng.toFixed(4)).join(',');
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}` +
    `&current=temperature_2m,apparent_temperature,wind_gusts_10m,rain,snowfall,weather_code` +
    `&hourly=snowfall` +
    `&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_min,snowfall_sum,rain_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,weather_code` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=7`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load Southeast Wisconsin regional tracker');
  const raw = await res.json();
  const entries = Array.isArray(raw) ? raw : [raw];

  return locations.map((loc, idx) => {
    const entry = entries[idx] || {};
    const hourlySnowUnit = entry.hourly_units?.snowfall;
    const dailySnowUnit = entry.daily_units?.snowfall_sum;

    const temp = Math.round(entry.current?.temperature_2m ?? 0);
    const feelsLike = Math.round(entry.current?.apparent_temperature ?? temp);
    const windGusts = Math.round(entry.current?.wind_gusts_10m ?? 0);
    const code = Number(entry.current?.weather_code ?? 0);
    const curRain = Number(entry.current?.rain ?? 0);
    const curSnow = normalizeToInches(entry.current?.snowfall, entry.current_units?.snowfall);

    const startIdx = findCurrentHourIndex(entry.hourly?.time || [], entry.current?.time);
    let snow48h = 0;
    for (let h = startIdx; h < startIdx + 48; h++) {
      if (entry.hourly?.snowfall?.[h] === undefined) break;
      snow48h += normalizeToInches(entry.hourly.snowfall[h], hourlySnowUnit);
    }

    const dailySnowArr: number[] = Array.isArray(entry.daily?.snowfall_sum)
      ? entry.daily.snowfall_sum
      : [];
    const snow7d = dailySnowArr.reduce(
      (sum, val) => sum + normalizeToInches(val, dailySnowUnit),
      0
    );

    const todayMax = Math.round(entry.daily?.temperature_2m_max?.[0] ?? temp);
    const todayMin = Math.round(entry.daily?.temperature_2m_min?.[0] ?? temp);
    const todayFeelsMin = Math.round(entry.daily?.apparent_temperature_min?.[0] ?? feelsLike);
    const todayProb = Math.round(entry.daily?.precipitation_probability_max?.[0] ?? 0);
    const todaySnow = roundInches(normalizeToInches(entry.daily?.snowfall_sum?.[0], dailySnowUnit));
    const todayRain = Number(entry.daily?.rain_sum?.[0] ?? curRain);
    const todayWind = Math.round(entry.daily?.wind_speed_10m_max?.[0] ?? 0);
    const todayGust = Math.round(entry.daily?.wind_gusts_10m_max?.[0] ?? windGusts);
    const todayCode = Number(entry.daily?.weather_code?.[0] ?? code);

    const pClass = classifyPrecipType(
      todayCode,
      Math.round((todayMax * 2 + todayMin) / 3),
      Math.max(todaySnow, curSnow),
      todayRain,
      todayProb
    );

    const work = evaluateDayWorkability({
      tempMax: todayMax,
      tempMin: todayMin,
      feelsLikeMin: todayFeelsMin,
      snowfallIn: todaySnow,
      precipProb: todayProb,
      precipType: pClass.type,
      windSpeedMax: todayWind,
      windGustsMax: todayGust,
      weatherCode: todayCode,
    });

    return {
      location: loc,
      temp,
      feelsLike,
      windGusts,
      snow48hIn: roundInches(snow48h),
      snow7dIn: roundInches(snow7d),
      precipType: pClass.type,
      precipTypeLabel: pClass.label,
      workability: work.status,
      workabilityLabel: work.label,
    };
  });
}
