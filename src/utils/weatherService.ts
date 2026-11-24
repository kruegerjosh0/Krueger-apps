import {
  LocationInfo,
  WeatherCondition,
  HourlyForecast,
  DailyForecast,
  NextTwoHoursSlot,
  PrecipMode,
  PrecipType,
  WorkabilityStatus,
  ExteriorGuardCheck,
  ExteriorGuardSummary,
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
  nextTwoHours: NextTwoHoursSlot[];
  exteriorGuard: ExteriorGuardSummary;
  winterOutlook: WinterOutlookSummary;
  fetchedAt: string;
}

/**
 * Normalizes Open-Meteo precipitation/snowfall measurements into inches.
 */
function normalizeToInches(value: number | null | undefined, unit?: string): number {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num) || num <= 0) return 0;
  const u = (unit || '').toLowerCase().trim();
  if (u === 'cm') return num / 2.54;
  if (u === 'mm') return num / 25.4;
  return num;
}

function roundInches2(val: number): number {
  return Math.round(val * 100) / 100;
}

function roundInches1(val: number): number {
  return Math.round(val * 10) / 10;
}

export function formatInches(val: number): string {
  if (!Number.isFinite(val) || val <= 0) return '0.0"';
  if (val < 0.05) return '<0.1"';
  return `${val.toFixed(val < 1 ? 2 : 1).replace(/0$/, '')}"`;
}

export function formatRainInches(val: number): string {
  if (!Number.isFinite(val) || val <= 0) return '0.00"';
  if (val < 0.01) return '<0.01"';
  return `${val.toFixed(2)}"`;
}

export function formatSnowInches(val: number): string {
  if (!Number.isFinite(val) || val <= 0) return '0.0"';
  if (val < 0.1) return '<0.1"';
  return `${val.toFixed(1)}"`;
}

export function isSnowWmoCode(code: number): boolean {
  return (code >= 71 && code <= 77) || code === 85 || code === 86;
}

export function isRainWmoCode(code: number): boolean {
  return (
    (code >= 51 && code <= 67) ||
    (code >= 80 && code <= 82) ||
    (code >= 95 && code <= 99)
  );
}

export function isFreezingRainWmoCode(code: number): boolean {
  return code === 56 || code === 57 || code === 66 || code === 67;
}

export function describeWmoCode(code: number): string {
  switch (code) {
    case 0: return 'Clear Sky';
    case 1: return 'Mostly Clear';
    case 2: return 'Partly Cloudy';
    case 3: return 'Overcast';
    case 45: return 'Fog';
    case 48: return 'Freezing Fog';
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
    case 81: return 'Moderate Rain Showers';
    case 82: return 'Heavy Rain Showers';
    case 85: return 'Snow Showers';
    case 86: return 'Heavy Snow Showers';
    case 95: return 'Thunderstorm';
    case 96: return 'Thunderstorm & Hail';
    case 99: return 'Severe Thunderstorm';
    default: return 'Partly Cloudy';
  }
}

function dryIconForCode(code: number): string {
  if (code === 0 || code === 1) return '☀️';
  if (code === 2) return '⛅';
  if (code === 45 || code === 48) return '🌫️';
  return '☁️';
}

export interface PrecipClassification {
  mode: PrecipMode;
  type: PrecipType;
  label: string;
  icon: string;
}

/**
 * Mutually exclusive Daily / Current Precipitation Mode:
 * 1. snowfall_sum > 0 AND rain_sum > 0 => Wintry Mix
 * 2. snowfall_sum > 0 OR WMO snow codes (71-77, 85-86) => Snow
 * 3. rain_sum > 0 OR precip_prob >= 20 OR WMO rain codes (51-67, 80-82, 95-99) => Rain
 * 4. Else => Dry / Clear
 */
export function classifyDailyPrecipMode(params: {
  snowfallSumIn: number;
  rainSumIn: number;
  precipProbMax: number;
  weatherCode: number;
}): PrecipClassification {
  const { snowfallSumIn, rainSumIn, precipProbMax, weatherCode } = params;

  if (snowfallSumIn > 0 && rainSumIn > 0) {
    return {
      mode: 'WINTRY_MIX',
      type: 'WINTRY_MIX',
      label: 'Wintry Mix',
      icon: '🌨️',
    };
  }

  if (snowfallSumIn > 0 || isSnowWmoCode(weatherCode)) {
    return {
      mode: 'SNOW',
      type: 'SNOW',
      label: 'Snow',
      icon: '❄️',
    };
  }

  if (rainSumIn > 0 || precipProbMax >= 20 || isRainWmoCode(weatherCode)) {
    const isThunder = weatherCode >= 95 && weatherCode <= 99;
    const isFreezing = isFreezingRainWmoCode(weatherCode);
    return {
      mode: 'RAIN',
      type: isFreezing ? 'FREEZING_RAIN' : 'RAIN',
      label: isFreezing ? 'Freezing Rain' : isThunder ? 'Storms' : 'Rain',
      icon: isThunder ? '⛈️' : '🌧️',
    };
  }

  return {
    mode: 'DRY',
    type: 'NONE',
    label: 'Dry / Clear',
    icon: dryIconForCode(weatherCode),
  };
}

/**
 * Mutually exclusive Hourly Precipitation Mode:
 * Strictly ONLY labels Snow on hours where `snowfall > 0`.
 */
export function classifyHourlyPrecipMode(params: {
  snowfallIn: number;
  rainIn: number;
  precipProb: number;
  weatherCode: number;
}): PrecipClassification {
  const { snowfallIn, rainIn, precipProb, weatherCode } = params;

  if (snowfallIn > 0 && rainIn > 0) {
    return {
      mode: 'WINTRY_MIX',
      type: 'WINTRY_MIX',
      label: 'Mix',
      icon: '🌨️',
    };
  }

  if (snowfallIn > 0) {
    return {
      mode: 'SNOW',
      type: 'SNOW',
      label: 'Snow',
      icon: '❄️',
    };
  }

  if (rainIn > 0 || precipProb >= 20 || isRainWmoCode(weatherCode)) {
    const isThunder = weatherCode >= 95 && weatherCode <= 99;
    const isFreezing = isFreezingRainWmoCode(weatherCode);
    return {
      mode: 'RAIN',
      type: isFreezing ? 'FREEZING_RAIN' : 'RAIN',
      label: isFreezing ? 'Freezing Rain' : isThunder ? 'Storm' : 'Rain',
      icon: isThunder ? '⛈️' : '🌧️',
    };
  }

  return {
    mode: 'DRY',
    type: 'NONE',
    label: 'Dry',
    icon: dryIconForCode(weatherCode),
  };
}

export function evaluateDayWorkability(params: {
  tempMax: number;
  tempMin: number;
  snowfallIn: number;
  rainSumIn: number;
  precipProb: number;
  precipMode: PrecipMode;
  precipType: PrecipType;
  windSpeedMax: number;
  windGustsMax: number;
  weatherCode: number;
}): { status: WorkabilityStatus; label: string; hint: string } {
  const {
    tempMax,
    tempMin,
    snowfallIn,
    rainSumIn,
    precipProb,
    precipMode,
    precipType,
    windSpeedMax,
    windGustsMax,
    weatherCode,
  } = params;

  if (precipType === 'FREEZING_RAIN' || weatherCode === 48) {
    return {
      status: 'SNOW_ICE_RISK',
      label: 'Hold — Ice Risk',
      hint: 'Freezing rain or glaze risk — skip exterior work and allow extra travel time.',
    };
  }

  if (precipMode === 'SNOW' || precipMode === 'WINTRY_MIX') {
    const accumNote =
      precipMode === 'WINTRY_MIX'
        ? `Wintry mix (${formatSnowInches(snowfallIn)} snow, ${formatRainInches(rainSumIn)} rain)`
        : snowfallIn > 0
        ? `Snowfall (~${formatSnowInches(snowfallIn)})`
        : 'Snow showers expected';
    return {
      status: 'SNOW_ICE_RISK',
      label: precipMode === 'WINTRY_MIX' ? 'Hold — Wintry Mix' : 'Hold — Snow',
      hint: `${accumNote} — exterior coatings halted; schedule heated interior rooms and protect paint from freezing.`,
    };
  }

  if (precipMode === 'RAIN' && (rainSumIn >= 0.1 || precipProb >= 50 || weatherCode >= 95)) {
    return {
      status: 'CAUTION',
      label: 'Hold — Rain',
      hint: `${precipProb}% rain chance${rainSumIn > 0 ? ` (~${formatRainInches(rainSumIn)})` : ''} — hold exterior painting and check dry cure windows.`,
    };
  }

  if (tempMax < 50 || tempMin <= 32) {
    return {
      status: 'CAUTION',
      label: tempMin <= 32 ? 'Caution — Freeze' : 'Caution — Cool',
      hint:
        tempMax < 35
          ? `High of ${tempMax}°F — too cold for exterior coatings; store latex paint indoors above 35°F.`
          : tempMax < 50
          ? `High of ${tempMax}°F is below 50°F standard latex threshold — use cold-rated exterior coatings or focus on interiors.`
          : `Overnight low of ${tempMin}°F — finish exterior coating early so paint cures before dark.`,
    };
  }

  if (windGustsMax > 20 || windSpeedMax >= 16) {
    return {
      status: 'CAUTION',
      label: 'Caution — Wind',
      hint: `Gusts up to ${windGustsMax} mph — watch overspray drift and ladder stability.`,
    };
  }

  if (precipMode === 'RAIN') {
    return {
      status: 'CAUTION',
      label: 'Watch — Rain',
      hint: `${precipProb}% rain chance — confirm a clean dry cure window before starting exterior coats.`,
    };
  }

  return {
    status: 'GO',
    label: 'Good Exterior',
    hint: `Ideal exterior spray & stain window — highs near ${tempMax}°F, dry skies, and gusts under ${Math.max(windGustsMax, 1)} mph.`,
  };
}

export function buildExteriorGuardSummary(
  current: WeatherCondition,
  hourly24: HourlyForecast[],
  daily7: DailyForecast[]
): ExteriorGuardSummary {
  const todayPeakGust = Math.max(
    current.windGusts,
    ...hourly24.slice(0, 12).map((h) => h.windGusts || h.windSpeed || 0)
  );
  const dewSpread = current.temp - current.dewPoint;

  // 4 core contractor checks
  const tempCheck: ExteriorGuardCheck =
    current.temp < 35
      ? {
          id: 'temp',
          label: 'Temperature',
          reading: `${current.temp}°F`,
          status: 'HOLD',
          detail: 'Below 35°F — no exterior latex; keep paint out of cold vans.',
        }
      : current.temp < 50
      ? {
          id: 'temp',
          label: 'Temperature',
          reading: `${current.temp}°F`,
          status: 'WARN',
          detail: 'Below 50°F standard exterior minimum (cold-rated coatings only).',
        }
      : {
          id: 'temp',
          label: 'Temperature',
          reading: `${current.temp}°F`,
          status: 'PASS',
          detail: 'Above 50°F — safe surface & air temp for exterior cure.',
        };

  const windCheck: ExteriorGuardCheck =
    todayPeakGust > 25 || current.windGusts > 25
      ? {
          id: 'wind',
          label: 'Wind Gusts',
          reading: `${current.windSpeed} mph (G ${todayPeakGust})`,
          status: 'HOLD',
          detail: 'Gusts > 25 mph — skip spraying and watch tall ladders.',
        }
      : todayPeakGust > 20 || current.windGusts > 20
      ? {
          id: 'wind',
          label: 'Wind Gusts',
          reading: `${current.windSpeed} mph (G ${todayPeakGust})`,
          status: 'WARN',
          detail: 'Gusts > 20 mph — brush/roll instead of spraying.',
        }
      : {
          id: 'wind',
          label: 'Wind Gusts',
          reading: `${current.windSpeed} mph (G ${todayPeakGust})`,
          status: 'PASS',
          detail: 'Gusts ≤ 20 mph — safe for spraying & ladder setup.',
        };

  const humidityCheck: ExteriorGuardCheck =
    current.humidity > 85 || dewSpread <= 4
      ? {
          id: 'humidity',
          label: 'Humidity & Dew Pt',
          reading: `${current.humidity}% • DP ${current.dewPoint}°F`,
          status: 'HOLD',
          detail:
            dewSpread <= 4
              ? 'Temp within 4°F of dew point — condensation/blushing risk.'
              : 'Humidity > 85% — slow cure and surfactant leaching risk.',
        }
      : current.humidity > 75 || dewSpread <= 6
      ? {
          id: 'humidity',
          label: 'Humidity & Dew Pt',
          reading: `${current.humidity}% • DP ${current.dewPoint}°F`,
          status: 'WARN',
          detail: 'Elevated moisture — allow extra recoat time on shaded sides.',
        }
      : {
          id: 'humidity',
          label: 'Humidity & Dew Pt',
          reading: `${current.humidity}% • DP ${current.dewPoint}°F`,
          status: 'PASS',
          detail: 'Good drying spread above dew point.',
        };

  const precipCheck: ExteriorGuardCheck =
    current.precipMode === 'SNOW' || current.precipMode === 'WINTRY_MIX'
      ? {
          id: 'precip',
          label: 'Precipitation',
          reading:
            current.precipMode === 'WINTRY_MIX'
              ? 'Wintry Mix'
              : `Snow (${current.rainProb}%)`,
          status: 'HOLD',
          detail: 'Active snow/mix — exterior painting & washing on hold.',
        }
      : current.precipMode === 'RAIN' && (current.rainIn > 0 || current.rainProb >= 40)
      ? {
          id: 'precip',
          label: 'Precipitation',
          reading: `Rain (${current.rainProb}%)`,
          status: 'HOLD',
          detail: 'Active or likely rain — avoid exterior coatings.',
        }
      : current.precipMode === 'RAIN'
      ? {
          id: 'precip',
          label: 'Precipitation',
          reading: `Rain ${current.rainProb}%`,
          status: 'WARN',
          detail: 'Spotty rain chance — verify 4h dry cure window.',
        }
      : {
          id: 'precip',
          label: 'Precipitation',
          reading: 'Dry / Clear',
          status: 'PASS',
          detail: 'No active rain or snow — dry surfaces.',
        };

  const checks: ExteriorGuardCheck[] = [tempCheck, windCheck, humidityCheck, precipCheck];

  // Overall Exterior Painting Verdict
  const hasHold = checks.some((c) => c.status === 'HOLD');
  const hasWarn = checks.some((c) => c.status === 'WARN');

  const paintingStatus: 'GO' | 'CAUTION' | 'HOLD' = hasHold
    ? 'HOLD'
    : hasWarn
    ? 'CAUTION'
    : 'GO';
  const paintingLabel =
    paintingStatus === 'GO'
      ? 'Good Window'
      : paintingStatus === 'CAUTION'
      ? 'Caution Window'
      : 'Hold Exterior';

  const flaggedPainting = checks
    .filter((c) => c.status !== 'PASS')
    .map((c) => c.label.toLowerCase());
  const paintingSummary =
    paintingStatus === 'GO'
      ? 'Temps ≥ 50°F, gusts ≤ 20 mph, low moisture, and dry surfaces — green light for exterior coats.'
      : `Watch ${flaggedPainting.join(', ')} before applying exterior paint today.`;

  // Pressure Washing Verdict (more tolerant of humidity & 40–49°F cool temps, strict on freeze/storms/heavy gusts)
  const washingHold =
    current.temp < 38 ||
    current.precipMode === 'SNOW' ||
    current.precipMode === 'WINTRY_MIX' ||
    current.weatherCode >= 95 ||
    todayPeakGust > 28;
  const washingWarn =
    !washingHold &&
    (current.temp < 45 || todayPeakGust > 20 || (current.precipMode === 'RAIN' && current.rainIn > 0.05));

  const washingStatus: 'GO' | 'CAUTION' | 'HOLD' = washingHold
    ? 'HOLD'
    : washingWarn
    ? 'CAUTION'
    : 'GO';
  const washingLabel =
    washingStatus === 'GO'
      ? 'Good to Wash'
      : washingStatus === 'CAUTION'
      ? 'Caution'
      : 'Hold Washing';
  const washingSummary =
    washingStatus === 'GO'
      ? 'Safe temps and wind for decks, siding prep, and driveway washing.'
      : washingStatus === 'HOLD'
      ? current.temp < 38
        ? 'Too close to freezing — pump/hose freeze risk and icy runoff.'
        : 'Storm, snow, or high wind hazard — reschedule outdoor washing.'
      : 'Workable for washing — watch wind spray drift and slower wood dry-out.';

  // Find best contiguous exterior painting hours today (temp >= 50, gusts <= 20, DRY)
  const todayHours = hourly24.filter((h) => h.dayLabel === 'Today');
  const workableHours = todayHours.filter(
    (h) => h.temp >= 50 && h.windGusts <= 20 && h.precipMode === 'DRY' && h.humidity <= 85
  );
  let bestWindowLabel = 'No full exterior paint window today (plan interior work)';
  if (workableHours.length > 0) {
    const first = workableHours[0].timeStr;
    const last = workableHours[workableHours.length - 1].timeStr;
    bestWindowLabel =
      workableHours.length === 1
        ? `Best exterior hour: ${first}`
        : `Best exterior window: ${first} – ${last} (${workableHours.length} hrs)`;
  }

  // Conditional 7-day Snow & Freeze alert data (ONLY populates when actually forecast)
  const first7 = daily7.slice(0, 7);
  const snowDays7d = first7
    .filter((d) => d.precipMode === 'SNOW' || d.precipMode === 'WINTRY_MIX')
    .map((d) => ({
      dayName: d.dayName,
      snowfallIn: d.snowfallIn,
      rainSumIn: d.rainSumIn,
      precipProb: d.rainProb,
      precipMode: d.precipMode,
    }));

  const freezeDays7d = first7
    .filter((d) => d.tempMin <= 32)
    .map((d) => ({ dayName: d.dayName, tempMin: d.tempMin }));

  const totalSnow7dIn = roundInches1(
    first7.reduce((sum, d) => sum + (d.snowfallIn || 0), 0)
  );
  const lowestTemp7d =
    first7.length > 0 ? Math.min(...first7.map((d) => d.tempMin)) : current.temp;

  return {
    paintingStatus,
    paintingLabel,
    paintingSummary,
    washingStatus,
    washingLabel,
    washingSummary,
    bestWindowLabel,
    checks,
    hasSnowOrFreeze7d: snowDays7d.length > 0 || freezeDays7d.length > 0,
    snowDays7d,
    freezeDays7d,
    lowestTemp7d,
    totalSnow7dIn,
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
          msg = 'Location permission was denied. Please allow location access or search for a city.';
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
    const prefix = currentIso.slice(0, 13);
    const exactIdx = hourlyTimes.findIndex((t) => t.startsWith(prefix));
    if (exactIdx !== -1) return exactIdx;
  }
  const nowHour = new Date().getHours();
  return Math.min(nowHour, Math.max(0, hourlyTimes.length - 1));
}

function buildLegacyWinterOutlook(
  hourly24: HourlyForecast[],
  daily7: DailyForecast[]
): WinterOutlookSummary {
  const snow48hIn = roundInches1(hourly24.reduce((sum, h) => sum + (h.snowfallIn || 0), 0));
  const snow7dIn = roundInches1(daily7.reduce((sum, d) => sum + (d.snowfallIn || 0), 0));
  const snowDays7d = daily7.filter((d) => d.precipMode === 'SNOW' || d.precipMode === 'WINTRY_MIX');
  const hasFreezingRainRisk = daily7.some((d) => d.precipType === 'FREEZING_RAIN');
  const lowestTemp7d = daily7.length > 0 ? Math.min(...daily7.map((d) => d.tempMin)) : 45;
  const lowestFeelsLike7d = daily7.length > 0 ? Math.min(...daily7.map((d) => d.feelsLikeMin)) : 45;
  const peakGust7d = daily7.length > 0 ? Math.max(...daily7.map((d) => d.windGustsMax)) : 0;
  const freezingNights7d = daily7.filter((d) => d.tempMin <= 32).length;
  const nextSnowDay = snowDays7d[0];
  const advisories: WinterAdvisoryItem[] = [];

  return {
    snow48hIn,
    snow7dIn,
    snow10dIn: snow7dIn,
    snowDaysCount7d: snowDays7d.length,
    lowestTemp7d,
    lowestFeelsLike7d,
    peakGust7d,
    freezingNights7d,
    hasFreezingRainRisk,
    severity:
      snow7dIn >= 4 || hasFreezingRainRisk
        ? 'STORM_ALERT'
        : snowDays7d.length > 0
        ? 'ADVISORY'
        : freezingNights7d > 0
        ? 'COLD_WATCH'
        : 'CLEAR',
    headline:
      snowDays7d.length > 0
        ? `Snow Forecast — ${formatSnowInches(snow7dIn)} Over 7 Days`
        : freezingNights7d > 0
        ? `Freeze Watch — Lows to ${lowestTemp7d}°F`
        : 'Clear 7-Day Outlook',
    advisories,
    nextSnowEvent: nextSnowDay
      ? {
          dayName: nextSnowDay.dayName,
          snowfallIn: nextSnowDay.snowfallIn,
          precipProb: nextSnowDay.rainProb,
          windGustsMax: nextSnowDay.windGustsMax,
          precipTypeLabel: nextSnowDay.precipTypeLabel,
        }
      : undefined,
  };
}

function formatSunTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatShortDateBadge(dateStr: string): string {
  const dObj = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(dObj.getTime())) return dateStr;
  const wk = dObj.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  const m = dObj.getMonth() + 1;
  const day = dObj.getDate();
  return `${wk} ${m}/${day}`;
}

function nightIconForCode(code: number, precipMode: PrecipMode): string {
  if (precipMode === 'WINTRY_MIX') return '🌨️';
  if (precipMode === 'SNOW') return '❄️';
  if (precipMode === 'RAIN') return code >= 95 ? '⛈️' : '🌧️';
  if (code === 0 || code === 1) return '🌙';
  if (code === 2) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  return '☁️';
}

export async function fetchFullWeather(lat: number, lng: number): Promise<FullWeatherResponse> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,cloud_cover,wind_speed_10m,wind_gusts_10m,precipitation,rain,snowfall,weather_code` +
    `&minutely_15=precipitation,rain,snowfall,weather_code` +
    `&hourly=weather_code,temperature_2m,apparent_temperature,precipitation_probability,rain,snowfall,relative_humidity_2m,dew_point_2m,cloud_cover,wind_speed_10m,wind_gusts_10m` +
    `&daily=weather_code,sunrise,sunset,precipitation_probability_max,rain_sum,snowfall_sum,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,wind_speed_10m_max,wind_gusts_10m_max` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=10`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch weather data from Open-Meteo');
  const data = await res.json();

  const curSnowUnit = data.current_units?.snowfall;
  const curRainUnit = data.current_units?.rain;
  const minutelySnowUnit = data.minutely_15_units?.snowfall;
  const minutelyRainUnit = data.minutely_15_units?.rain;
  const hourlySnowUnit = data.hourly_units?.snowfall;
  const hourlyRainUnit = data.hourly_units?.rain;
  const dailySnowUnit = data.daily_units?.snowfall_sum;
  const dailyRainUnit = data.daily_units?.rain_sum;

  // Aggregate per-day humidity, dew point, and Day/Night breakdowns from full 10-day hourly series
  interface DayHourlyBucket {
    humSum: number;
    dewSum: number;
    count: number;
    dayCode: number | null;
    nightCode: number | null;
    nightProbMax: number;
    nightWindMax: number;
    nightGustMax: number;
    nightRainSum: number;
    nightSnowSum: number;
    hasNight: boolean;
  }
  const dailyBuckets = new Map<string, DayHourlyBucket>();
  if (Array.isArray(data.hourly?.time)) {
    for (let i = 0; i < data.hourly.time.length; i++) {
      const iso = data.hourly.time[i];
      if (!iso) continue;
      const dateKey = iso.slice(0, 10);
      const hourNum = Number(iso.slice(11, 13));
      const hum = Number(data.hourly.relative_humidity_2m?.[i]);
      const dew = Number(data.hourly.dew_point_2m?.[i]);
      const code = Number(data.hourly.weather_code?.[i] ?? 0);
      const prob = Number(data.hourly.precipitation_probability?.[i] ?? 0);
      const wind = Number(data.hourly.wind_speed_10m?.[i] ?? 0);
      const gust = Number(data.hourly.wind_gusts_10m?.[i] ?? wind);
      const hRain = normalizeToInches(data.hourly.rain?.[i], hourlyRainUnit);
      const hSnow = normalizeToInches(data.hourly.snowfall?.[i], hourlySnowUnit);

      const bucket: DayHourlyBucket = dailyBuckets.get(dateKey) || {
        humSum: 0,
        dewSum: 0,
        count: 0,
        dayCode: null,
        nightCode: null,
        nightProbMax: 0,
        nightWindMax: 0,
        nightGustMax: 0,
        nightRainSum: 0,
        nightSnowSum: 0,
        hasNight: false,
      };
      if (Number.isFinite(hum) || Number.isFinite(dew)) {
        bucket.humSum += Number.isFinite(hum) ? hum : 0;
        bucket.dewSum += Number.isFinite(dew) ? dew : 0;
        bucket.count += 1;
      }
      if (hourNum >= 10 && hourNum <= 16 && (bucket.dayCode === null || code > bucket.dayCode)) {
        bucket.dayCode = code;
      }
      if (hourNum >= 18 || hourNum <= 5) {
        bucket.hasNight = true;
        if (bucket.nightCode === null || code > bucket.nightCode) {
          bucket.nightCode = code;
        }
        if (prob > bucket.nightProbMax) bucket.nightProbMax = prob;
        if (wind > bucket.nightWindMax) bucket.nightWindMax = wind;
        if (gust > bucket.nightGustMax) bucket.nightGustMax = gust;
        bucket.nightRainSum += hRain;
        bucket.nightSnowSum += hSnow;
      }
      dailyBuckets.set(dateKey, bucket);
    }
  }

  // Build 36-hour forecast starting from current local hour
  const hourlyList: HourlyForecast[] = [];
  const startIdx = findCurrentHourIndex(data.hourly?.time || [], data.current?.time);
  const todayDateStr = (data.daily?.time?.[0] || '').slice(0, 10);
  const tomorrowDateStr = (data.daily?.time?.[1] || '').slice(0, 10);

  if (data.hourly?.time) {
    for (let i = startIdx; i < startIdx + 36; i++) {
      const isoTime = data.hourly.time[i];
      if (!isoTime) break;

      const d = new Date(isoTime);
      const timeStr =
        i === startIdx
          ? 'Now'
          : d.toLocaleTimeString([], { hour: 'numeric', hour12: true });
      const datePart = isoTime.slice(0, 10);
      const dayLabel =
        datePart === todayDateStr
          ? 'Today'
          : d.toLocaleDateString('en-US', { weekday: 'short' });
      const dayDividerLabel =
        datePart === todayDateStr
          ? 'TODAY'
          : datePart === tomorrowDateStr
          ? 'TOMORROW'
          : formatShortDateBadge(datePart);

      const hTemp = Math.round(data.hourly.temperature_2m?.[i] ?? 0);
      const hFeels = Math.round(data.hourly.apparent_temperature?.[i] ?? hTemp);
      const hHum = Math.round(data.hourly.relative_humidity_2m?.[i] ?? 0);
      const hDew = Math.round(data.hourly.dew_point_2m?.[i] ?? hTemp - 10);
      const hCloud = Math.round(data.hourly.cloud_cover?.[i] ?? 0);
      const hProb = Math.round(data.hourly.precipitation_probability?.[i] ?? 0);
      const hWind = Math.round(data.hourly.wind_speed_10m?.[i] ?? 0);
      const hGust = Math.round(data.hourly.wind_gusts_10m?.[i] ?? hWind);
      const hSnow = roundInches2(normalizeToInches(data.hourly.snowfall?.[i], hourlySnowUnit));
      const hRain = roundInches2(normalizeToInches(data.hourly.rain?.[i], hourlyRainUnit));
      const hCode = Number(data.hourly.weather_code?.[i] ?? 0);
      const hDesc = describeWmoCode(hCode);

      const hClass = classifyHourlyPrecipMode({
        snowfallIn: hSnow,
        rainIn: hRain,
        precipProb: hProb,
        weatherCode: hCode,
      });

      hourlyList.push({
        isoTime,
        dateStr: datePart,
        dayLabel,
        dayDividerLabel,
        timeStr,
        temp: hTemp,
        feelsLike: hFeels,
        humidity: hHum,
        dewPoint: hDew,
        cloudCover: hCloud,
        rainProb: hProb,
        windSpeed: hWind,
        windGusts: hGust,
        rainIn: hRain,
        snowfallIn: hSnow,
        precipIn: roundInches2(hRain + hSnow),
        weatherCode: hCode,
        wmoDescription: hDesc,
        precipMode: hClass.mode,
        precipLabel: hClass.label,
        precipType: hClass.type,
        precipIcon: hClass.icon,
      });
    }
  }

  // Build Next-2-Hours (8 x 15-minute slots) from minutely_15 with automatic fallback to hourly
  const nextTwoHours: NextTwoHoursSlot[] = [];
  if (Array.isArray(data.minutely_15?.time) && data.minutely_15.time.length >= 8) {
    const curIso: string = data.current?.time || '';
    let mStart = 0;
    if (curIso) {
      const idx = data.minutely_15.time.findIndex((t: string) => t >= curIso);
      if (idx !== -1) mStart = idx;
    }
    for (let s = 0; s < 8; s++) {
      const mIdx = mStart + s;
      const isoTime = data.minutely_15.time[mIdx];
      if (!isoTime) break;
      const mRain = roundInches2(normalizeToInches(data.minutely_15.rain?.[mIdx], minutelyRainUnit));
      const mSnow = roundInches2(normalizeToInches(data.minutely_15.snowfall?.[mIdx], minutelySnowUnit));
      const mCode = Number(data.minutely_15.weather_code?.[mIdx] ?? 0);
      const refHour = hourlyList[Math.min(Math.floor(s / 4), Math.max(0, hourlyList.length - 1))];
      const mProb = refHour ? refHour.rainProb : 0;
      const mode: PrecipMode =
        mSnow > 0 && mRain > 0
          ? 'WINTRY_MIX'
          : mSnow > 0
          ? 'SNOW'
          : mRain > 0 || isRainWmoCode(mCode)
          ? 'RAIN'
          : 'DRY';
      const dObj = new Date(isoTime);
      const timeStr =
        s === 0
          ? 'Now'
          : Number.isNaN(dObj.getTime())
          ? `+${s * 15}m`
          : dObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
      nextTwoHours.push({
        isoTime,
        minuteOffset: s * 15,
        timeStr,
        rainIn: mRain,
        snowfallIn: mSnow,
        precipIn: roundInches2(mRain + mSnow),
        precipProb: mProb,
        mode,
      });
    }
  } else {
    for (let s = 0; s < 8; s++) {
      const h = hourlyList[Math.min(Math.floor(s / 4), Math.max(0, hourlyList.length - 1))];
      const mRain = h ? roundInches2(h.rainIn / 4) : 0;
      const mSnow = h ? roundInches2(h.snowfallIn / 4) : 0;
      const mProb = h ? h.rainProb : 0;
      const mode: PrecipMode =
        mSnow > 0 && mRain > 0
          ? 'WINTRY_MIX'
          : mSnow > 0
          ? 'SNOW'
          : mRain > 0 || (h && h.precipMode === 'RAIN' && h.rainProb >= 40)
          ? 'RAIN'
          : 'DRY';
      nextTwoHours.push({
        isoTime: h?.isoTime || '',
        minuteOffset: s * 15,
        timeStr: s === 0 ? 'Now' : `+${s * 15}m`,
        rainIn: mRain,
        snowfallIn: mSnow,
        precipIn: roundInches2(mRain + mSnow),
        precipProb: mProb,
        mode,
      });
    }
  }

  // Build 10-day outlook
  const dailyList: DailyForecast[] = [];
  if (data.daily?.time) {
    const count = Math.min(10, data.daily.time.length);
    for (let d = 0; d < count; d++) {
      const dateStr = data.daily.time[d];
      const dObj = new Date(dateStr + 'T00:00:00');
      const dayName =
        d === 0
          ? 'Today'
          : d === 1
          ? `Tomorrow (${dObj.toLocaleDateString('en-US', { weekday: 'short' })})`
          : dObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const shortDateLabel = formatShortDateBadge(dateStr);

      const tempMax = Math.round(data.daily.temperature_2m_max?.[d] ?? 0);
      const tempMin = Math.round(data.daily.temperature_2m_min?.[d] ?? 0);
      const feelsLikeMax = Math.round(data.daily.apparent_temperature_max?.[d] ?? tempMax);
      const feelsLikeMin = Math.round(data.daily.apparent_temperature_min?.[d] ?? tempMin);
      const bucket = dailyBuckets.get(dateStr.slice(0, 10));
      const humidityMean = bucket && bucket.count > 0
        ? Math.round(bucket.humSum / bucket.count)
        : Math.round(data.current?.relative_humidity_2m ?? 55);
      const dewPointMean = bucket && bucket.count > 0
        ? Math.round(bucket.dewSum / bucket.count)
        : Math.round(tempMin - 5);
      const sunrise = formatSunTime(data.daily.sunrise?.[d]);
      const sunset = formatSunTime(data.daily.sunset?.[d]);
      const rainProb = Math.round(data.daily.precipitation_probability_max?.[d] ?? 0);
      const snowfallIn = roundInches2(normalizeToInches(data.daily.snowfall_sum?.[d], dailySnowUnit));
      const rainSumIn = roundInches2(normalizeToInches(data.daily.rain_sum?.[d], dailyRainUnit));
      const windSpeedMax = Math.round(data.daily.wind_speed_10m_max?.[d] ?? 0);
      const windGustsMax = Math.round(data.daily.wind_gusts_10m_max?.[d] ?? windSpeedMax);
      const dCode = Number(data.daily.weather_code?.[d] ?? 0);
      const dDesc = describeWmoCode(dCode);

      const dClass = classifyDailyPrecipMode({
        snowfallSumIn: snowfallIn,
        rainSumIn,
        precipProbMax: rainProb,
        weatherCode: dCode,
      });

      const dayCondition =
        bucket && bucket.dayCode !== null ? describeWmoCode(bucket.dayCode) : dDesc;
      const nightCode = bucket && bucket.nightCode !== null ? bucket.nightCode : dCode;
      const nightPrecipProb = bucket && bucket.hasNight ? Math.round(bucket.nightProbMax) : Math.max(0, Math.round(rainProb * 0.7));
      const nightMode: PrecipMode =
        bucket && bucket.hasNight
          ? bucket.nightSnowSum > 0 && bucket.nightRainSum > 0
            ? 'WINTRY_MIX'
            : bucket.nightSnowSum > 0
            ? 'SNOW'
            : bucket.nightRainSum > 0 || nightPrecipProb >= 30
            ? 'RAIN'
            : 'DRY'
          : dClass.mode;
      const nightCondition =
        nightMode === 'DRY' && (nightCode === 0 || nightCode === 1)
          ? 'Clear Night'
          : describeWmoCode(nightCode);
      const nightIcon = nightIconForCode(nightCode, nightMode);
      const nightWindSpeed = bucket && bucket.hasNight ? Math.round(bucket.nightWindMax) : Math.max(4, Math.round(windSpeedMax * 0.75));
      const nightWindGusts = bucket && bucket.hasNight ? Math.round(bucket.nightGustMax) : Math.max(nightWindSpeed, Math.round(windGustsMax * 0.75));

      const workabilityEval = evaluateDayWorkability({
        tempMax,
        tempMin,
        snowfallIn,
        rainSumIn,
        precipProb: rainProb,
        precipMode: dClass.mode,
        precipType: dClass.type,
        windSpeedMax,
        windGustsMax,
        weatherCode: dCode,
      });

      dailyList.push({
        dateStr,
        dayName,
        shortDateLabel,
        tempMax,
        tempMin,
        feelsLikeMax,
        feelsLikeMin,
        humidityMean,
        dewPointMean,
        sunrise,
        sunset,
        rainProb,
        rainSumIn,
        snowfallIn,
        precipSumIn: roundInches2(rainSumIn + snowfallIn),
        windSpeedMax,
        windGustsMax,
        weatherCode: dCode,
        wmoDescription: dDesc,
        dayCondition,
        nightCondition,
        nightIcon,
        nightPrecipProb,
        nightWindSpeed,
        nightWindGusts,
        precipMode: dClass.mode,
        precipType: dClass.type,
        precipTypeLabel: dClass.label,
        precipIcon: dClass.icon,
        workability: workabilityEval.status,
        workabilityLabel: workabilityEval.label,
        workabilityHint: workabilityEval.hint,
      });
    }
  }

  // Current conditions using strict mutually exclusive Rain vs. Snow logic
  const curTemp = Math.round(data.current?.temperature_2m ?? 0);
  const curFeelsLike = Math.round(data.current?.apparent_temperature ?? curTemp);
  const curHum = Math.round(data.current?.relative_humidity_2m ?? 0);
  const curDewPoint = Math.round(
    data.current?.dew_point_2m ?? hourlyList[0]?.dewPoint ?? curTemp - 10
  );
  const curCloudCover = Math.round(
    data.current?.cloud_cover ?? hourlyList[0]?.cloudCover ?? 0
  );
  const curWind = Math.round(data.current?.wind_speed_10m ?? 0);
  const curGusts = Math.round(data.current?.wind_gusts_10m ?? curWind);
  const curPrecip = roundInches2(Number(data.current?.precipitation ?? 0));
  const curRainIn = roundInches2(normalizeToInches(data.current?.rain, curRainUnit));
  const curSnowIn = roundInches2(normalizeToInches(data.current?.snowfall, curSnowUnit));
  const weatherCode = Number(data.current?.weather_code ?? 0);
  const wmoDescription = describeWmoCode(weatherCode);

  const curPrecipProb =
    hourlyList[0]?.rainProb ??
    dailyList[0]?.rainProb ??
    0;

  const curClass = classifyDailyPrecipMode({
    snowfallSumIn: curSnowIn,
    rainSumIn: curRainIn,
    precipProbMax: curPrecipProb,
    weatherCode,
  });

  // Dashboard/current badge — strictly honors Rain vs. Snow vs. Dry mode (no snow text on rainy/dry days)
  let condText = `${curClass.icon} ${wmoDescription} — Dry / Clear`;
  let badgeBg = '#30d158';
  let badgeText = 'Dry / Clear';
  let workability: WorkabilityStatus = 'GO';
  let workabilityLabel = 'Good Exterior';
  let advice = 'Dry conditions — solid window for exterior painting and pressure washing.';

  if (curClass.mode === 'WINTRY_MIX') {
    condText = `🌨️ Wintry Mix (${curTemp}°F • Feels ${curFeelsLike}°F)`;
    badgeBg = '#ef4444';
    badgeText = 'Wintry Mix';
    workability = 'SNOW_ICE_RISK';
    workabilityLabel = 'Hold Exterior';
    advice = 'Wintry mix active — hold exterior work and watch slick surfaces.';
  } else if (curClass.mode === 'SNOW') {
    condText = `❄️ Snow (${curTemp}°F • ${curPrecipProb}% chance)`;
    badgeBg = '#38bdf8';
    badgeText = 'Snow';
    workability = 'SNOW_ICE_RISK';
    workabilityLabel = 'Hold — Snow';
    advice = 'Snow conditions — hold exterior coatings and keep waterborne paint warm indoors.';
  } else if (curClass.mode === 'RAIN') {
    condText = `${curClass.icon} ${curClass.label} (${curPrecipProb}% chance • ${curTemp}°F)`;
    badgeBg = curRainIn > 0 || curPrecipProb >= 50 ? '#f59e0b' : '#0ea5e9';
    badgeText = curRainIn > 0 ? 'Active Rain' : `Rain ${curPrecipProb}%`;
    workability = 'CAUTION';
    workabilityLabel = curRainIn > 0 ? 'Hold — Rain' : 'Watch Rain';
    advice =
      curRainIn > 0
        ? 'Active rain — pause exterior painting and verify dry cure window.'
        : `${curPrecipProb}% rain chance — confirm dry cure window before exterior coating.`;
  } else if (curTemp < 50) {
    condText = `${curClass.icon} ${wmoDescription} (${curTemp}°F — Cool for Exterior)`;
    badgeBg = '#f59e0b';
    badgeText = curTemp <= 32 ? 'Freeze Guard' : 'Cool <50°F';
    workability = 'CAUTION';
    workabilityLabel = 'Caution — Cool';
    advice =
      curTemp <= 32
        ? 'Sub-freezing air temp — store latex paint indoors above 35°F.'
        : 'Below 50°F standard exterior threshold — use cold-rated coatings or focus on interiors.';
  } else if (curGusts > 20) {
    condText = `💨 ${wmoDescription} • Gusts ${curGusts} mph`;
    badgeBg = '#f59e0b';
    badgeText = `Gusts ${curGusts} mph`;
    workability = 'CAUTION';
    workabilityLabel = 'Caution — Wind';
    advice = `Gusts to ${curGusts} mph — brush/roll instead of spraying and secure ladders.`;
  } else if (curHum > 80) {
    condText = `${curClass.icon} ${wmoDescription} • High Humidity (${curHum}%)`;
    badgeBg = '#f59e0b';
    badgeText = `Humid ${curHum}%`;
    workability = 'CAUTION';
    workabilityLabel = 'Slow Cure';
    advice = `Humidity at ${curHum}% (Dew Point ${curDewPoint}°F) — allow extra exterior dry time.`;
  }

  const current: WeatherCondition = {
    temp: curTemp,
    feelsLike: curFeelsLike,
    humidity: curHum,
    dewPoint: curDewPoint,
    cloudCover: curCloudCover,
    windSpeed: curWind,
    windGusts: curGusts,
    precipitation: curPrecip,
    rainIn: curRainIn,
    snowfallIn: curSnowIn,
    weatherCode,
    wmoDescription,
    rainProb: curPrecipProb,
    precipMode: curClass.mode,
    precipIcon: curClass.icon,
    precipType: curClass.type,
    precipTypeLabel: curClass.label,
    workability,
    workabilityLabel,
    conditionText: condText,
    badgeBg,
    badgeText,
    advice,
  };

  const exteriorGuard = buildExteriorGuardSummary(current, hourlyList.slice(0, 24), dailyList);
  const winterOutlook = buildLegacyWinterOutlook(hourlyList, dailyList);

  return {
    current,
    hourly: hourlyList,
    daily: dailyList,
    nextTwoHours,
    exteriorGuard,
    winterOutlook,
    fetchedAt: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
  };
}

export async function fetchRegionalSeWiWeather(
  locations: LocationInfo[] = DEFAULT_WISCONSIN_PRESETS
): Promise<RegionalWeatherSnapshot[]> {
  if (locations.length === 0) return [];

  const lats = locations.map((l) => l.lat.toFixed(4)).join(',');
  const lngs = locations.map((l) => l.lng.toFixed(4)).join(',');
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}` +
    `&current=temperature_2m,apparent_temperature,wind_gusts_10m,rain,snowfall,weather_code` +
    `&daily=temperature_2m_max,temperature_2m_min,snowfall_sum,rain_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,weather_code` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=7`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load Southeast Wisconsin regional tracker');
  const raw = await res.json();
  const entries = Array.isArray(raw) ? raw : [raw];

  return locations.map((loc, idx) => {
    const entry = entries[idx] || {};
    const dailySnowUnit = entry.daily_units?.snowfall_sum;
    const dailyRainUnit = entry.daily_units?.rain_sum;

    const temp = Math.round(entry.current?.temperature_2m ?? 0);
    const feelsLike = Math.round(entry.current?.apparent_temperature ?? temp);
    const windGusts = Math.round(entry.current?.wind_gusts_10m ?? 0);
    const code = Number(entry.current?.weather_code ?? 0);

    const dailySnowArr: number[] = Array.isArray(entry.daily?.snowfall_sum)
      ? entry.daily.snowfall_sum
      : [];
    const snow7d = dailySnowArr.reduce(
      (sum, val) => sum + normalizeToInches(val, dailySnowUnit),
      0
    );

    const todayMax = Math.round(entry.daily?.temperature_2m_max?.[0] ?? temp);
    const todayMin = Math.round(entry.daily?.temperature_2m_min?.[0] ?? temp);
    const todayProb = Math.round(entry.daily?.precipitation_probability_max?.[0] ?? 0);
    const todaySnow = roundInches2(normalizeToInches(entry.daily?.snowfall_sum?.[0], dailySnowUnit));
    const todayRain = roundInches2(normalizeToInches(entry.daily?.rain_sum?.[0], dailyRainUnit));
    const todayWind = Math.round(entry.daily?.wind_speed_10m_max?.[0] ?? 0);
    const todayGust = Math.round(entry.daily?.wind_gusts_10m_max?.[0] ?? windGusts);
    const todayCode = Number(entry.daily?.weather_code?.[0] ?? code);

    const pClass = classifyDailyPrecipMode({
      snowfallSumIn: todaySnow,
      rainSumIn: todayRain,
      precipProbMax: todayProb,
      weatherCode: todayCode,
    });

    const work = evaluateDayWorkability({
      tempMax: todayMax,
      tempMin: todayMin,
      snowfallIn: todaySnow,
      rainSumIn: todayRain,
      precipProb: todayProb,
      precipMode: pClass.mode,
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
      snow48hIn: roundInches1(todaySnow),
      snow7dIn: roundInches1(snow7d),
      precipType: pClass.type,
      precipTypeLabel: pClass.label,
      workability: work.status,
      workabilityLabel: work.label,
    };
  });
}
