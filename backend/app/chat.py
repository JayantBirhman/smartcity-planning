import os
import uuid
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.app.db import db
from backend.app.auth import get_current_user, now_iso
from backend.app.config import logger

router = APIRouter(tags=["chat"])

class ChatIn(BaseModel):
    project_id: Optional[str] = None
    message: str
    zone_context: Optional[Dict[str, Any]] = None

def build_system_prompt(project: Optional[Dict], zone_ctx: Optional[Dict]) -> str:
    base = (
        "You are SmartScape AI Planner, an expert urban planning assistant helping planners "
        "make data-driven decisions for Indian smart cities. You are integrated with a planning "
        "analytics engine and answer using the specific project data provided. Keep answers concise "
        "(3-6 short bullet points), practical and reference the numbers from the project when relevant. "
        "Avoid emojis. Do NOT claim to run live Autodesk Forma analysis."
    )
    if project:
        p = project
        base += f"\n\nCURRENT PROJECT CONTEXT:\n- Name: {p.get('name')}\n- Location: {p.get('location', {}).get('name')}\n"
        base += f"- Site area: {p.get('site_area_sqkm')} sq.km\n- Target population: {p.get('population', {}).get('forecast_population'):,}\n"
        infra = p.get("infrastructure", {})
        base += f"- Infra deficits — Schools: {infra.get('schools',{}).get('deficit')}, Hospitals: {infra.get('hospitals',{}).get('deficit')}, Parks: {infra.get('parks',{}).get('deficit')}\n"
        base += f"- Overall planning score: {p.get('score',{}).get('overall')}/100\n"
        base += "- Zones: " + ", ".join(f"{z['name']} ({z['percentage']}%)" for z in p.get("zones", [])) + "\n"
    if zone_ctx:
        base += f"\nSELECTED MAP CONTEXT: {zone_ctx}\n"
    return base

def _fallback_reply(msg: str, project: Optional[Dict], zone_ctx: Optional[Dict]) -> str:
    m = msg.lower()
    if project:
        p = project
        pop = p.get("population", {}).get("forecast_population", 0)
        infra = p.get("infrastructure", {})
        if "school" in m:
            return f"• Required schools: {infra['schools']['required']} for a projected population of {pop:,}\n• Existing: {infra['schools']['existing']}\n• Deficit: {infra['schools']['deficit']}\n• Distribute new schools across residential zones with a 1km walking radius."
        if "hospital" in m:
            return f"• Required hospitals: {infra['hospitals']['required']}\n• Existing: {infra['hospitals']['existing']}\n• Deficit: {infra['hospitals']['deficit']}\n• Locate hospitals near arterial roads for accessibility."
        if "risk" in m or "challenge" in m:
            return "• Top risks: Traffic congestion (High), Infrastructure deficit (High), Flood risk (Medium)\n• Prioritize distributed commercial nodes and reserve 15%+ green space to mitigate."
        if "proposal" in m or "compare" in m:
            return f"• Proposal A (Balanced): score {p['proposals'][0]['score']}\n• Proposal B (Sustainable): score {p['proposals'][1]['score']}\n• Recommendation: Proposal B offers better green cover and sustainability metrics."
        if "sustain" in m:
            return f"• Green space: {p['sustainability']['green_space_pct']}%\n• Solar potential score: {p['sustainability']['solar_potential']['score']}/100\n• Boost sustainability by increasing green cover and rooftop solar mandates."
    if zone_ctx:
        return f"• Zone {zone_ctx.get('id')} — {zone_ctx.get('name')}: {zone_ctx.get('percentage')}% of site\n• Purpose: {zone_ctx.get('purpose')}\n• Reasoning: {zone_ctx.get('reasoning')}"
    return "• Please open a project first so I can answer with your specific planning context.\n• Tip: Ask about schools, hospitals, sustainability, risks or proposal comparison."

@router.post("/chat")
async def chat(body: ChatIn, user=Depends(get_current_user)):
    project = None
    if body.project_id:
        project = await db.projects.find_one({"id": body.project_id, "user_id": user["id"]}, {"_id": 0})

    system_prompt = build_system_prompt(project, body.zone_context)

    # Try Emergent LLM (Claude Sonnet 5) — graceful fallback if unavailable
    reply = None
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        session_id = f"{user['id']}-{body.project_id or 'global'}"
        chat_client = LlmChat(
            api_key=os.environ.get("EMERGENT_LLM_KEY"),
            session_id=session_id,
            system_message=system_prompt,
        ).with_model("anthropic", "claude-sonnet-5")
        response = await chat_client.send_message(UserMessage(text=body.message))
        reply = response if isinstance(response, str) else str(response)
    except Exception as e:
        logger.warning(f"LLM fallback: {e}")
        reply = _fallback_reply(body.message, project, body.zone_context)

    # persist
    msg = {"id": str(uuid.uuid4()), "user_id": user["id"], "project_id": body.project_id,
           "message": body.message, "reply": reply, "zone_context": body.zone_context, "created_at": now_iso()}
    await db.chat_messages.insert_one(msg)
    msg.pop("_id", None)
    return {"reply": reply, "message_id": msg["id"]}

@router.get("/projects/{pid}/chat")
async def project_chat(pid: str, user=Depends(get_current_user)):
    docs = await db.chat_messages.find({"user_id": user["id"], "project_id": pid}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return docs
