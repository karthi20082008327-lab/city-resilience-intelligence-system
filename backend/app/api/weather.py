import httpx
from fastapi import APIRouter, HTTPException
from app.core.settings import settings
from app.schemas.incident import WeatherData

router = APIRouter(prefix="/api/weather", tags=["Weather"])

CITY_COORDS = {
    "vijayamangalam": {"lat": settings.CITY_LAT, "lon": settings.CITY_LON, "country": "IN"},
    "mumbai": {"lat": 19.0760, "lon": 72.8777, "country": "IN"},
    "delhi": {"lat": 28.6139, "lon": 77.2090, "country": "IN"},
    "bangalore": {"lat": 12.9716, "lon": 77.5946, "country": "IN"},
    "chennai": {"lat": 13.0827, "lon": 80.2707, "country": "IN"},
}


async def fetch_weather_open_meteo(lat: float, lon: float) -> dict:
    url = (
        f"https://api.open-meteo.com/v1/forecast?"
        f"latitude={lat}&longitude={lon}"
        f"&current=temperature_2m,relative_humidity_2m,wind_speed_10m,surface_pressure,weather_code"
        f"&daily=uv_index_max,precipitation_probability_max"
        f"&timezone=auto"
    )
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.json()


WMO_CODES = {
    0: ("Clear sky", "01d"), 1: ("Mainly clear", "01d"), 2: ("Partly cloudy", "02d"),
    3: ("Overcast", "03d"), 45: ("Foggy", "50d"), 48: ("Rime fog", "50d"),
    51: ("Light drizzle", "09d"), 53: ("Moderate drizzle", "09d"), 55: ("Dense drizzle", "09d"),
    61: ("Slight rain", "10d"), 63: ("Moderate rain", "10d"), 65: ("Heavy rain", "10d"),
    71: ("Slight snow", "13d"), 73: ("Moderate snow", "13d"), 75: ("Heavy snow", "13d"),
    80: ("Slight showers", "09d"), 81: ("Moderate showers", "09d"), 82: ("Violent showers", "09d"),
    95: ("Thunderstorm", "11d"), 96: ("Thunderstorm with hail", "11d"), 99: ("Thunderstorm with heavy hail", "11d"),
}


@router.get("/", response_model=WeatherData)
async def get_weather(city: str = None):
    city_name = (city or settings.WEATHER_CITY).lower()
    coords = CITY_COORDS.get(city_name, {"lat": settings.WEATHER_LAT, "lon": settings.WEATHER_LON, "country": "IN"})

    try:
        data = await fetch_weather_open_meteo(coords["lat"], coords["lon"])
    except Exception as e:
        return WeatherData(
            temperature=32.0, humidity=65.0, wind_speed=12.0, pressure=1013.0,
            description="Partly cloudy", icon="02d", rain_probability=20.0,
            uv_index=6.0, air_quality=50.0, city=city_name.title(), country=coords["country"],
        )

    current = data.get("current", {})
    daily = data.get("daily", {})

    temp = current.get("temperature_2m", 32.0)
    humidity = current.get("relative_humidity_2m", 65.0)
    wind = current.get("wind_speed_10m", 12.0)
    pressure = current.get("surface_pressure", 1013.0)
    weather_code = current.get("weather_code", 0)

    description, icon = WMO_CODES.get(weather_code, ("Unknown", "03d"))
    rain_prob = (daily.get("precipitation_probability_max", [0.0]))[0] if daily.get("precipitation_probability_max") else 0.0
    uv_index = (daily.get("uv_index_max", [0.0]))[0] if daily.get("uv_index_max") else 0.0

    return WeatherData(
        temperature=round(temp, 1),
        humidity=round(humidity, 1),
        wind_speed=round(wind, 1),
        pressure=round(pressure, 1),
        description=description,
        icon=icon,
        rain_probability=round(rain_prob, 1),
        uv_index=round(uv_index, 1),
        air_quality=round(min(humidity * 0.8, 100), 1),
        city=city_name.title(),
        country=coords["country"],
    )


@router.get("/risk-assessment")
async def weather_risk_assessment(city: str = None):
    weather = await get_weather(city)
    flood_risk = 0.0
    recommendation = "Conditions are normal."

    if weather.rain_probability > 80 and weather.wind_speed > 30:
        flood_risk = 0.9
        recommendation = "HIGH FLOOD RISK: Heavy rain with strong winds detected. Activate flood response protocols."
    elif weather.rain_probability > 60:
        flood_risk = 0.6
        recommendation = "MODERATE FLOOD RISK: Significant rain expected. Monitor drainage systems."
    elif weather.rain_probability > 40:
        flood_risk = 0.3
        recommendation = "LOW FLOOD RISK: Moderate rain possible. Standby for updates."
    elif weather.uv_index > 8:
        recommendation = "EXTREME HEAT: UV index very high. Issue heat advisory for citizens."
    elif weather.wind_speed > 40:
        recommendation = "HIGH WIND WARNING: Strong gusts detected. Secure loose objects."

    return {
        "city": weather.city,
        "flood_risk": flood_risk,
        "uv_risk": min(weather.uv_index / 11.0, 1.0),
        "wind_risk": min(weather.wind_speed / 60.0, 1.0),
        "overall_risk": round((flood_risk + min(weather.uv_index / 11.0, 1.0) + min(weather.wind_speed / 60.0, 1.0)) / 3, 2),
        "recommendation": recommendation,
        "weather": weather,
    }
