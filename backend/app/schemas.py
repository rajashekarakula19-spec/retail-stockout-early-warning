from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


RiskLevel = Literal["critical", "high", "medium", "low"]


class ScenarioInput(BaseModel):
    leadTimeDays: int
    promoUpliftPct: int
    safetyStockUnits: int


class AssistantMessage(BaseModel):
    id: str
    role: Literal["user", "assistant"]
    content: str


class AssistantRequest(BaseModel):
    message: str
    history: list[AssistantMessage] = []
