"""
天气查询工具 - 使用 wttr.in 免费 API（无需 key）

用法:
    result = query_weather("北京")
    # → {"city": "北京", "temp": "22°C", "condition": "晴", "humidity": "45%", ...}
"""

import re
from typing import Any

import httpx

# 城市中英文映射（wttr.in 只认英文/拼音）
CITY_MAP: dict[str, str] = {
    "北京": "Beijing",
    "上海": "Shanghai",
    "广州": "Guangzhou",
    "深圳": "Shenzhen",
    "杭州": "Hangzhou",
    "成都": "Chengdu",
    "南京": "Nanjing",
    "武汉": "Wuhan",
    "重庆": "Chongqing",
    "西安": "Xi'an",
    "天津": "Tianjin",
    "苏州": "Suzhou",
    "长沙": "Changsha",
    "青岛": "Qingdao",
    "大连": "Dalian",
    "厦门": "Xiamen",
    "福州": "Fuzhou",
    "合肥": "Hefei",
    "昆明": "Kunming",
    "哈尔滨": "Harbin",
    "沈阳": "Shenyang",
    "郑州": "Zhengzhou",
    "济南": "Jinan",
    "宁波": "Ningbo",
    "无锡": "Wuxi",
    "珠海": "Zhuhai",
    "london": "London",
    "tokyo": "Tokyo",
    "new york": "New+York",
    "paris": "Paris",
    "berlin": "Berlin",
    "sydney": "Sydney",
    "moscow": "Moscow",
    "singapore": "Singapore",
    "bangkok": "Bangkok",
    "dubai": "Dubai",
}

# 触发关键词（用户消息包含这些词时激活天气工具）
TRIGGER_KEYWORDS = [
    "天气", "温度", "气温", "下雨", "下雪", "台风", "雾霾",
    "weather", "temperature", "rain", "snow",
]


def detect_weather_intent(message: str) -> str | None:
    """检查用户消息是否包含天气查询意图。返回提取的城市名（英文），没触发返回 None。"""
    msg_lower = message.lower().strip()

    has_trigger = any(kw in msg_lower for kw in TRIGGER_KEYWORDS)
    print(f"[WEATHER] check message='{message[:60]}' has_trigger={has_trigger}")

    if not has_trigger:
        return None

    for cn, en in CITY_MAP.items():
        if cn in message:
            print(f"[WEATHER] matched city: {cn} -> {en}")
            return en

    for cn, en in CITY_MAP.items():
        if cn.lower() in msg_lower:
            print(f"[WEATHER] matched city (lower): {cn} -> {en}")
            return en

    if any(kw in message for kw in ("全国", "中国", "china")):
        print(f"[WEATHER] national weather request")
        return ""

    print(f"[WEATHER] trigger found but no city detected, returning None")
    return None


async def query_weather(city_en: str) -> dict[str, Any] | None:
    """查询天气。city_en 为英文城市名（如 "Beijing"）。返回结构化天气数据，失败返回 None。"""
    try:
        url = f"https://wttr.in/{city_en}?format=j1"
        print(f"[WEATHER] querying url={url}")
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers={"Accept": "application/json"})
            print(f"[WEATHER] response status={resp.status_code}")
            if resp.status_code != 200:
                print(f"[WEATHER] non-200 response, body={resp.text[:200]}")
                return None
            data = resp.json()

        current = data.get("current_condition", [{}])[0]
        if not current:
            return None

        # 解析数据
        temp = current.get("temp_C", "?")
        feels_like = current.get("FeelsLikeC", "?")
        humidity = current.get("humidity", "?")
        wind_speed = current.get("windspeedKmph", "?")
        wind_dir = current.get("winddir16Point", "?")
        desc = current.get("weatherDesc", [{}])[0].get("value", "?")
        pressure = current.get("pressure", "?")
        visibility = current.get("visibility", "?")
        cloud_cover = current.get("cloudcover", "?")

        # 获取地区名
        nearest_area = data.get("nearest_area", [{}])[0]
        area_name = nearest_area.get("areaName", [{}])[0].get("value", city_en)
        country = nearest_area.get("country", [{}])[0].get("value", "")

        return {
            "city": area_name,
            "country": country,
            "temperature": f"{temp}°C",
            "feels_like": f"{feels_like}°C",
            "condition": desc,
            "humidity": f"{humidity}%",
            "wind": f"{wind_dir} {wind_speed}km/h",
            "pressure": f"{pressure}hPa",
            "visibility": f"{visibility}km",
            "cloud_cover": f"{cloud_cover}%",
        }
    except Exception as e:
        return None


def build_tool_prompt(city: str, weather_data: dict[str, Any]) -> str:
    """
    将天气数据格式化为一段文本，方便拼入 system prompt。
    """
    lines = [
        f"【实时天气信息 - {weather_data.get('city', city)}】",
        f"天气状况：{weather_data.get('condition', '?')}",
        f"温度：{weather_data.get('temperature', '?')}（体感 {weather_data.get('feels_like', '?')}）",
        f"湿度：{weather_data.get('humidity', '?')}",
        f"风向风速：{weather_data.get('wind', '?')}",
        f"气压：{weather_data.get('pressure', '?')}",
        f"能见度：{weather_data.get('visibility', '?')}",
        "（数据来源：wttr.in）",
    ]
    return "\n".join(lines)
