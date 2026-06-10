const KOREA_TZ = "Asia/Seoul";

const KOREAN_CITIES = [
  "\uC11C\uC6B8",
  "\uBD80\uC0B0",
  "\uB300\uAD6C",
  "\uC778\uCC9C",
  "\uAD11\uC8FC",
  "\uB300\uC804",
  "\uC6B8\uC0B0",
  "\uC138\uC885",
  "\uC218\uC6D0",
  "\uC131\uB0A8",
  "\uACE0\uC591",
  "\uC6A9\uC778",
  "\uCC3D\uC6D0",
  "\uCCAD\uC8FC",
  "\uC804\uC8FC",
  "\uCC9C\uC548",
  "\uC81C\uC8FC",
  "\uAC15\uB989",
  "\uCD98\uCC9C",
  "\uD3EC\uD56D",
  "\uAE40\uD574",
];

const CITY_GEO = {
  "\uC11C\uC6B8": { search: "Seoul", latitude: 37.566, longitude: 126.9784, admin1: "\uC11C\uC6B8\uD2B9\uBCC4\uC2DC" },
  "\uBD80\uC0B0": { search: "Busan", latitude: 35.1796, longitude: 129.0756, admin1: "\uBD80\uC0B0\uAD11\uC5ED\uC2DC" },
  "\uB300\uAD6C": { search: "Daegu", latitude: 35.8714, longitude: 128.6014, admin1: "\uB300\uAD6C\uAD11\uC5ED\uC2DC" },
  "\uC778\uCC9C": { search: "Incheon", latitude: 37.4563, longitude: 126.7052, admin1: "\uC778\uCC9C\uAD11\uC5ED\uC2DC" },
  "\uAD11\uC8FC": { search: "Gwangju", latitude: 35.1595, longitude: 126.8526, admin1: "\uAD11\uC8FC\uAD11\uC5ED\uC2DC" },
  "\uB300\uC804": { search: "Daejeon", latitude: 36.3504, longitude: 127.3845, admin1: "\uB300\uC804\uAD11\uC5ED\uC2DC" },
  "\uC6B8\uC0B0": { search: "Ulsan", latitude: 35.5384, longitude: 129.3114, admin1: "\uC6B8\uC0B0\uAD11\uC5ED\uC2DC" },
  "\uC138\uC885": { search: "Sejong", latitude: 36.4801, longitude: 127.289, admin1: "\uC138\uC885\uD2B9\uBCC4\uC790\uCE58\uC2DC" },
  "\uC218\uC6D0": { search: "Suwon", latitude: 37.2636, longitude: 127.0286, admin1: "\uACBD\uAE30\uB3C4" },
  "\uC131\uB0A8": { search: "Seongnam", latitude: 37.4201, longitude: 127.1262, admin1: "\uACBD\uAE30\uB3C4" },
  "\uACE0\uC591": { search: "Goyang", latitude: 37.6584, longitude: 126.832, admin1: "\uACBD\uAE30\uB3C4" },
  "\uC6A9\uC778": { search: "Yongin", latitude: 37.2411, longitude: 127.1776, admin1: "\uACBD\uAE30\uB3C4" },
  "\uCC3D\uC6D0": { search: "Changwon", latitude: 35.228, longitude: 128.6811, admin1: "\uACBD\uC0C1\uB0A8\uB3C4" },
  "\uCCAD\uC8FC": { search: "Cheongju", latitude: 36.6424, longitude: 127.489, admin1: "\uCDA9\uCCAD\uBD81\uB3C4" },
  "\uC804\uC8FC": { search: "Jeonju", latitude: 35.8242, longitude: 127.148, admin1: "\uC804\uB77C\uBD81\uB3C4" },
  "\uCC9C\uC548": { search: "Cheonan", latitude: 36.8151, longitude: 127.1139, admin1: "\uCDA9\uCCAD\uB0A8\uB3C4" },
  "\uC81C\uC8FC": { search: "Jeju", latitude: 33.4996, longitude: 126.5312, admin1: "\uC81C\uC8FC\uD2B9\uBCC4\uC790\uCE58\uB3C4" },
  "\uAC15\uB989": { search: "Gangneung", latitude: 37.7519, longitude: 128.8761, admin1: "\uAC15\uC6D0\uB3C4" },
  "\uCD98\uCC9C": { search: "Chuncheon", latitude: 37.8813, longitude: 127.7298, admin1: "\uAC15\uC6D0\uB3C4" },
  "\uD3EC\uD56D": { search: "Pohang", latitude: 36.019, longitude: 129.3435, admin1: "\uACBD\uBD81\uB3C4" },
  "\uAE40\uD574": { search: "Gimhae", latitude: 35.234, longitude: 128.889, admin1: "\uACBD\uC0C1\uB0A8\uB3C4" },
};

const WEATHER_CODE_LABELS = {
  0: "\uB9D1\uC74C",
  1: "\uB300\uCCB4\uB85C \uB9D1\uC74C",
  2: "\uBD80\uBD84\uC801\uC73C\uB85C \uD770\uB984",
  3: "\uD770\uB984",
  45: "\uC548\uAC1C",
  48: "\uC9D1\uC740 \uC548\uAC1C",
  51: "\uAC00\uBEB4\uC6B4 \uC774\uC2AC\uBE44",
  53: "\uC774\uC2AC\uBE44",
  55: "\uAC15\uD55C \uC774\uC2AC\uBE44",
  56: "\uAC00\uBEB4\uC6B4 \uC5B4\uB294 \uC774\uC2AC\uBE44",
  57: "\uC5B4\uB294 \uC774\uC2AC\uBE44",
  61: "\uC57D\uD55C \uBE44",
  63: "\uBE44",
  65: "\uAC15\uD55C \uBE44",
  66: "\uAC00\uBEB4\uC6B4 \uC5B4\uB294 \uBE44",
  67: "\uC5B4\uB294 \uBE44",
  71: "\uC57D\uD55C \uB208",
  73: "\uB208",
  75: "\uAC15\uD55C \uB208",
  77: "\uC9C4\uB208\uAE43\uBE44",
  80: "\uC57D\uD55C \uC18C\uB098\uAE30",
  81: "\uC18C\uB098\uAE30",
  82: "\uAC15\uD55C \uC18C\uB098\uAE30",
  85: "\uC57D\uD55C \uB208 \uC18C\uB098\uAE30",
  86: "\uAC15\uD55C \uB208 \uC18C\uB098\uAE30",
  95: "\uB1CC\uC6B0",
  96: "\uC6B0\uBC1C\uC744 \uB3D9\uBC18\uD55C \uB1CC\uC6B0",
  99: "\uAC15\uD55C \uC6B0\uBC1C \uB1CC\uC6B0",
};

export function isWeatherQuery(message) {
  const normalized = String(message || "").replace(/\s+/g, "");
  return /(?:\uB0A0\uC528|weather|\uAE30\uC628|\uBBF8\uC138\uBA38\uC9C0|\uBE44\uC62C|\uB208\uC62C|\uCCB4\uAC10\uC628\uB3C4|\uC6B0\uC0B0)/i.test(normalized);
}

function weatherCodeLabel(code) {
  return WEATHER_CODE_LABELS[Number(code)] || "\uC54C \uC218 \uC5C6\uC74C";
}

function resolveWeatherDay(text) {
  const normalized = String(text || "").replace(/\s+/g, "");
  if (/(?:\uBAA8\uB798|\uAE00\uD53C)/.test(normalized)) return "dayAfter";
  if (/\uB0B4\uC77C/.test(normalized)) return "tomorrow";
  return "today";
}

function weatherDayLabel(dayKey) {
  if (dayKey === "tomorrow") return "\uB0B4\uC77C";
  if (dayKey === "dayAfter") return "\uBAA8\uB798";
  return "\uC624\uB298";
}

export function extractCityFromWeatherQuery(message) {
  const text = String(message || "").trim();
  for (const city of KOREAN_CITIES) {
    if (text.includes(city)) return city;
  }
  return process.env.WEATHER_DEFAULT_CITY || "\uC11C\uC6B8";
}

async function resolveLocation(cityName) {
  const key = String(cityName || "").trim();
  const preset = CITY_GEO[key];
  if (preset?.latitude != null && preset?.longitude != null) {
    return {
      latitude: preset.latitude,
      longitude: preset.longitude,
      name: key,
      admin1: preset.admin1 || "",
      country: "\uB300\uD55C\uBBFC\uAD6D",
    };
  }

  const geocoded = await geocodeCity(preset?.search || key);
  if (geocoded) return geocoded;

  if (preset?.search) {
    return geocodeCity(preset.search);
  }

  return null;
}

async function geocodeCity(cityName) {
  const query = encodeURIComponent(String(cityName || "").trim());
  if (!query) return null;

  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${query}&count=1&language=ko&format=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;

  const data = await res.json();
  const row = Array.isArray(data?.results) ? data.results[0] : null;
  if (!row) return null;

  return {
    latitude: row.latitude,
    longitude: row.longitude,
    name: row.name || cityName,
    admin1: row.admin1 || "",
    country: row.country || "",
  };
}

async function fetchForecast({ latitude, longitude }) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current:
      "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max",
    timezone: KOREA_TZ,
    forecast_days: "3",
  });

  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Weather API ${res.status}: ${text.slice(0, 120)}`);
  }
  return res.json();
}

function formatTemp(value) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  return `${Math.round(Number(value))}\u00B0C`;
}

function formatWindMs(value) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  return `${Math.round(Number(value) * 3.6)}km/h`;
}

export async function toolGetWeather({ city, rawQuery } = {}) {
  const queryText = String(rawQuery || "").trim();
  const cityName = String(city || extractCityFromWeatherQuery(queryText) || "\uC11C\uC6B8").trim();
  const dayKey = resolveWeatherDay(queryText);

  try {
    const location = await resolveLocation(cityName);
    if (!location) {
      return { ok: false, error: `"${cityName}" \uC9C0\uC5ED\uC744 \uCC3E\uC9C0 \uBABF\uD588\uC2B5\uB2C8\uB2E4.` };
    }

    const forecast = await fetchForecast(location);
    const placeLabel = location.admin1 ? `${location.name} (${location.admin1})` : location.name;

    if (dayKey === "today") {
      const current = forecast?.current || {};
      return {
        ok: true,
        placeLabel,
        dayLabel: weatherDayLabel(dayKey),
        condition: weatherCodeLabel(current.weather_code),
        temperature: current.temperature_2m,
        apparentTemperature: current.apparent_temperature,
        humidity: current.relative_humidity_2m,
        precipitation: current.precipitation,
        windSpeed: current.wind_speed_10m,
        source: "open-meteo",
      };
    }

    const dayIndex = dayKey === "tomorrow" ? 1 : 2;
    const daily = forecast?.daily || {};
    const codes = daily.weather_code || [];
    const maxTemps = daily.temperature_2m_max || [];
    const minTemps = daily.temperature_2m_min || [];
    const rainSums = daily.precipitation_sum || [];
    const rainProbs = daily.precipitation_probability_max || [];

    if (codes.length <= dayIndex) {
      return { ok: false, error: "\uC608\uBCF4 \uB370\uC774\uD130\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABF\uD588\uC2B5\uB2C8\uB2E4." };
    }

    return {
      ok: true,
      placeLabel,
      dayLabel: weatherDayLabel(dayKey),
      condition: weatherCodeLabel(codes[dayIndex]),
      temperatureMax: maxTemps[dayIndex],
      temperatureMin: minTemps[dayIndex],
      precipitationSum: rainSums[dayIndex],
      precipitationProbability: rainProbs[dayIndex],
      source: "open-meteo",
    };
  } catch (error) {
    return { ok: false, error: error?.message || "\uB0A0\uC528 \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4." };
  }
}

export function formatWeatherAnswer(data) {
  if (!data?.ok) return data?.error || "\uB0A0\uC528 \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";

  const lines = [`${data.placeLabel} ${data.dayLabel} \uB0A0\uC528`, `\u00B7 \uC0C1\uD0DC: ${data.condition}`];

  if (data.dayLabel === "\uC624\uB298") {
    lines.push(
      `\u00B7 \uAE30\uC628: ${formatTemp(data.temperature)} (\uCCB4\uAC10 ${formatTemp(data.apparentTemperature)})`,
    );
    if (data.humidity != null) lines.push(`\u00B7 \uC2B5\uB3C4: ${Math.round(Number(data.humidity))}%`);
    if (data.precipitation != null) lines.push(`\u00B7 \uAC15\uC218: ${Number(data.precipitation).toFixed(1)}mm`);
    if (data.windSpeed != null) lines.push(`\u00B7 \uD48D\uC18D: ${formatWindMs(data.windSpeed)}`);
  } else {
    lines.push(`\u00B7 \uCD5C\uACE0 ${formatTemp(data.temperatureMax)} / \uCD5C\uC800 ${formatTemp(data.temperatureMin)}`);
    if (data.precipitationSum != null) {
      lines.push(`\u00B7 \uC608\uC0C1 \uAC15\uC218: ${Number(data.precipitationSum).toFixed(1)}mm`);
    }
    if (data.precipitationProbability != null) {
      lines.push(`\u00B7 \uAC15\uC218 \uD655\uB960: ${Math.round(Number(data.precipitationProbability))}%`);
    }
  }

  lines.push("", "\u203B Open-Meteo \uAE30\uC0C1 \uC608\uBCF4 \uAE30\uC900\uC785\uB2C8\uB2E4.");
  return lines.join("\n");
}

export const GET_WEATHER_TOOL_DEFINITION = {
  type: "function",
  function: {
    name: "get_weather",
    description:
      "\uC9C0\uC5ED\uC758 \uC624\uB298\u00B7\uB0B4\uC77C\u00B7\uBAA8\uB798 \uB0A0\uC528(\uAE30\uC628, \uAC15\uC218, \uC0C1\uD0DC)\uB97C \uC870\uD68C\uD569\uB2C8\uB2E4. '\uC624\uB298 \uB0A0\uC528', '\uBD80\uC0B0 \uB0B4\uC77C \uB0A0\uC528' \uB4F1.",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string", description: "\uB3C4\uC2DC \uC774\uB984 (\uC608: \uC11C\uC6B8, \uBD80\uC0B0, \uC81C\uC8FC). \uC0DD\uB7B5 \uC2DC \uC11C\uC6B8." },
        rawQuery: { type: "string", description: "\uC0AC\uC6A9\uC790 \uC6D0\uBB38 (\uC624\uB298/\uB0B4\uC77C/\uBAA8\uB798 \uD310\uBCC4\uC6A9)" },
      },
    },
  },
};
