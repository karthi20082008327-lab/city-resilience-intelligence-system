import asyncio

from app.api.weather import weather_risk_assessment


def test_weather_risk_normal():
    async def run():
        result = await weather_risk_assessment("Vijayamangalam")
        return result

    result = asyncio.run(run())
    assert "flood_risk" in result
    assert "recommendation" in result
    assert 0.0 <= result["overall_risk"] <= 1.0
