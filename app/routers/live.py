from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Any
import json
import logging
import os
import asyncio
import base64

from google import genai
from google.genai import types

from app.database.chroma_db import chroma_db
from app.services.embedding_service import embedding_service

router = APIRouter(prefix="/live", tags=["live"])

# Exact model name returned by client.models.list() that supports bidiGenerateContent with Multimodal Vision
LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025"

active_clients = set()

# ── SERVER-SIDE SESSION STORE ──────────────────────────────────────────────────
SESSION_STORE: Dict[str, Dict] = {}          # sessionId -> session context
ACTIVE_SESSION_SOCKETS: Dict[str, Any] = {}  # sessionId -> live WebSocket

def get_or_create_session(session_id: str) -> Dict:
    if session_id not in SESSION_STORE:
        SESSION_STORE[session_id] = {
            "videos_generated": [],
            "mind_maps_created": [],
            "last_topic": None,
        }
    return SESSION_STORE[session_id]

def build_resumption_context(session: Dict) -> str:
    """Build a brief context message to orient Gemini on reconnect."""
    lines = ["[SESSION RESUME] You are reconnecting to an ongoing tutoring session."]
    if session.get("last_topic"):
        lines.append(f"The user was last discussing: {session['last_topic']}.")
    if session.get("mind_maps_created"):
        recent_maps = [m["title"] for m in session["mind_maps_created"][-3:]]
        lines.append(f"Mind maps created in this session: {', '.join(recent_maps)}.")
    if session.get("videos_generated"):
        recent_vids = [v["title"] for v in session["videos_generated"][-3:]]
        lines.append(f"Videos generated in this session: {', '.join(recent_vids)}.")
    lines.append("Greet the user very briefly (one sentence max) and wait.")
    return " ".join(lines)

@router.get("/config")
def get_live_config():
    return {
        "api_key": os.getenv("GEMINI_API_KEY", ""),
        "model": LIVE_MODEL
    }

def search_concept(query: str) -> Dict[str, Any]:
    """Function tool to search the vector database for a concept and return its coordinates."""
    logging.info(f"Function call triggered: search_concept with query: {query}")
    try:
        query_embedding = embedding_service.generate_embeddings([query])
        if not query_embedding:
            return {"error": "Failed to generate embedding for query."}
        results = chroma_db.search_nodes(query_embeddings=query_embedding, n_results=1)
        if not results or not results.get('ids') or len(results['ids'][0]) == 0:
            return {"status": "not_found", "message": f"Couldn't find any concepts matching '{query}'."}
        match_id = results['ids'][0][0]
        metadata = results['metadatas'][0][0]
        distance = results['distances'][0][0] if 'distances' in results and results['distances'] else None
        return {
            "status": "success",
            "concept_id": match_id,
            "label": metadata.get("label"),
            "description": metadata.get("description"),
            "coordinates": {
                "x": metadata.get("x"),
                "y": metadata.get("y"),
                "z": metadata.get("z")
            },
            "distance": distance
        }
    except Exception as e:
        logging.error(f"Error in search_concept: {e}")
        return {"error": str(e)}

@router.websocket("/ws-realtime")
async def live_agent_realtime_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    # Lock to prevent interleaving audio frames and tool responses
    send_lock = asyncio.Lock()
    
    active_clients.add(websocket)
    logging.info("Client connected to Python Live Agent Proxy")

    client = genai.Client(
        api_key=os.getenv("GEMINI_API_KEY"),
        http_options={'api_version': 'v1beta'}
    )

    config = types.LiveConnectConfig(
        tools=[types.Tool(
            function_declarations=[
                types.FunctionDeclaration(
                    name="search_concept",
                    description="Search for 3D coordinates of a concept in the knowledge base.",
                    parameters=types.Schema(
                        type=types.Type.OBJECT,
                        properties={
                            "query": types.Schema(type=types.Type.STRING, description="The concept to look up.")
                        },
                        required=["query"]
                    )
                ),
                types.FunctionDeclaration(
                    name="create_mind_map",
                    description=(
                        "Create and display a visual mind map on the user's screen. "
                        "Call this when the user asks to 'create a mind map', 'make a map', "
                        "'show me a mind map', or 'visualize' any topic as a mind map."
                    ),
                    parameters=types.Schema(
                        type=types.Type.OBJECT,
                        properties={
                            "title": types.Schema(
                                type=types.Type.STRING,
                                description="The central topic of the mind map."
                            ),
                            "mode": types.Schema(
                                type=types.Type.STRING,
                                description=(
                                    "Whether to create a brand-new map ('new') or merge nodes "
                                    "into the existing map ('append'). "
                                    "Use 'append' when the user says things like 'add this to the current map', "
                                    "'this is page 2 of the same chapter', 'add this to my existing graph', etc. "
                                    "Use 'new' for completely new topics."
                                )
                            ),
                            "nodes": types.Schema(
                                type=types.Type.ARRAY,
                                description="All nodes in the mind map, including the root and all branches.",
                                items=types.Schema(
                                    type=types.Type.OBJECT,
                                    properties={
                                        "id": types.Schema(type=types.Type.STRING, description="Unique node identifier (e.g. 'supervised_learning')"),
                                        "label": types.Schema(type=types.Type.STRING, description="Display label shown on the node"),
                                        "parent": types.Schema(type=types.Type.STRING, description="ID of the parent node. Use 'root' for top-level branches. Omit or null for the root node itself."),
                                        "description": types.Schema(type=types.Type.STRING, description="1-2 sentence explanation shown when the user clicks this node."),
                                    },
                                    required=["id", "label"]
                                )
                            ),
                        },
                        required=["title", "nodes"]
                    )
                ),
                types.FunctionDeclaration(
                    name="generate_video",
                    description=(
                        "Create and stream a highly engaging animated educational video explaining ANY topic, "
                        "such as Neural Networks, Physics, Math, or general stories (e.g., cats, kings, gravity). "
                        "Call this when the user asks to 'generate a video', 'animate', or 'show an animation'."
                    ),
                    parameters=types.Schema(
                        type=types.Type.OBJECT,
                        properties={
                            "prompt": types.Schema(
                                type=types.Type.STRING,
                                description="The topic, architecture, or prompt for the video generation."
                            )
                        },
                        required=["prompt"]
                    )
                ),
                types.FunctionDeclaration(
                    name="create_menu",
                    description=(
                        "Analyze a screenshot and create a 'menu' of interactive options or concepts. "
                        "Call this when the user mentions 'create a menu', 'show options from this screen', "
                        "or 'isolated version menu'."
                    ),
                    parameters=types.Schema(
                        type=types.Type.OBJECT,
                        properties={
                            "title": types.Schema(type=types.Type.STRING, description="The title of the menu."),
                            "items": types.Schema(
                                type=types.Type.ARRAY,
                                description="Actionable items or concepts extracted from the image.",
                                items=types.Schema(
                                    type=types.Type.OBJECT,
                                    properties={
                                        "id": types.Schema(type=types.Type.STRING, description="Unique item ID."),
                                        "label": types.Schema(type=types.Type.STRING, description="Display text."),
                                        "action": types.Schema(type=types.Type.STRING, description="What this item does (e.g. 'explore', 'deep dive', 'show video').")
                                    },
                                    required=["id", "label"]
                                )
                            )
                        },
                        required=["title", "items"]
                    )
                ),
                types.FunctionDeclaration(
                    name="generate_isolated_section",
                    description=(
                        "Generate a completely new 'isolated section' or 'app module' based on visual input. "
                        "Call this when the user says 'generate a section', 'create an app section', "
                        "or 'make a whole section from this'."
                    ),
                    parameters=types.Schema(
                        type=types.Type.OBJECT,
                        properties={
                            "title": types.Schema(type=types.Type.STRING, description="Title of the new section."),
                            "content_type": types.Schema(
                                type=types.Type.STRING, 
                                description="Type of section: 'interactive_quiz', 'concept_deep_dive', 'functional_module'."
                            ),
                            "payload": types.Schema(
                                type=types.Type.OBJECT,
                                description="JSON payload containing the structure/content for the section."
                            )
                        },
                        required=["title", "content_type", "payload"]
                    )
                ),
            ]
        )],
        response_modalities=["AUDIO"],
        media_resolution="MEDIA_RESOLUTION_LOW",
        context_window_compression=types.ContextWindowCompressionConfig(
            trigger_tokens=104857,
            sliding_window=types.SlidingWindow(target_tokens=52428),
        ),
        generation_config=types.GenerationConfig(
            temperature=0.1,
            top_k=2
        ),
        system_instruction=types.Content(parts=[types.Part.from_text(
            text=(
                "You are a conversational AI tutor embedded in a live Knowledge Graph explorer. "
                "The user's screen (graph images) and microphone audio are streamed to you in real time. "
                "You may also receive images from the user's camera (e.g. pages of a book) — treat these as visual context for learning. "
                "CORE CAPABILITY: Proactive Interactive Mapping. "
                "- If the user shows a page or concept, automatically read it and call `create_mind_map`. "
                "- LINKING LOGIC: Always favor mode='append' to add to the existing study graph unless the user explicitly asks for a 'new' map. "
                "- When appending, try to find 1-2 connections (links) between the NEW concepts and the EXISTING concepts in the graph. "
                "- If you see content that is completely irrelevant to the main topic (e.g. a different chapter, random notes), "
                "  still create the nodes, but DO NOT link them to the main cluster; let them form a separate cluster in the same graph. "
                "RULES FOR INTERACTION: "
                "- For general navigation and small updates, keep responses to 1-2 short sentences. "
                "- EXCEPTION: When explaining a NEW Mind Map or deep-diving into concepts, be rich, detailed, and providing in-depth knowledge. "
                "- If the user navigates a node, announce it simply. "
                "- If they ask a question about the book/camera view, answer directly. "
                "- DO NOT mention numerical distances or coordinates (e.g., 'distance: 0.1') in your verbal responses. Speak qualitatively. "
                "MIND MAP RULES: "
                "- Before calling the tool, say 'Let me read that for you...' or 'Adding those concepts to our graph...' "
                "- After the map appears, give a detailed architectural explanation of the nodes and their relationships. "
                "- Explain WHY the concepts are linked. Don't just list them. Give the student deep insights. "
                "- Root node id must be 'root'. "
                "ISOLATED MENU RULES: "
                "- If the user wants a 'menu' or 'isolated screen', capture the screenshot and call `create_menu`. "
                "- If the user wants a 'whole section' or 'new app module', call `generate_isolated_section`. "
                "VISUAL CONTEXT RULES: "
                "- You receive a periodic (every 2 seconds) visual heartbeat from the user's camera. Use this to maintain context proactively. "
                "VIDEO NARRATION RULES: "
                "- During video playback, provide a continuous frame-by-frame narration. Ignore the short response rule."
            )
        )])
    )


    try:
        async with client.aio.live.connect(model=LIVE_MODEL, config=config) as session:
            logging.info(f"Successfully connected to Gemini Live with model: {LIVE_MODEL}")

            # ── TOOL GATEKEEPER ────────────────────────────────────────────────────
            # asyncio.Event starts "set" (open). While a tool_call is in flight,
            # we clear() it so receive_from_client blocks instead of sending audio.
            # After the tool_response is sent, we set() it again to resume audio.
            tool_gate = asyncio.Event()
            tool_gate.set()  # Open by default — audio flows freely
            # ──────────────────────────────────────────────────
            current_session: Dict[str, Any] = {"id": None}  # mutable session state for this connection

            async def receive_from_client():
                """Forward frontend audio/images to Gemini, gated by tool_gate."""
                try:
                    while True:
                        data = await websocket.receive_text()
                        msg = json.loads(data)

                        # ── Session init: client sends its sessionId on connect
                        if msg.get("type") == "init":
                            session_id = msg.get("sessionId", "")
                            if session_id:
                                current_session["id"] = session_id
                                ACTIVE_SESSION_SOCKETS[session_id] = websocket
                                session_data = get_or_create_session(session_id)
                                logging.info(f"Session INIT: sessionId={session_id}, known={bool(session_data.get('last_topic'))}")
                                # If we have a prior context, send a brief resumption message to Gemini
                                if session_data.get("last_topic") or session_data.get("nodes_visited"):
                                    resumption_ctx = build_resumption_context(session_data)
                                    await session.send_client_content(
                                        turns=[types.Content(role="user", parts=[types.Part.from_text(text=resumption_ctx)])],
                                        turn_complete=True
                                    )
                            continue

                        # (Node history tracking has been removed by user request)

                        if "realtimeInput" in msg:
                            # ── CRITICAL: Do NOT block the receive loop waiting for a tool call.
                            # Instead: simply discard audio that arrives while a tool call is running.
                            
                            media_chunks = []
                            for chunk in msg["realtimeInput"]["mediaChunks"]:
                                mime_type = chunk["mimeType"]
                                raw_base64 = chunk["data"]
                                padding_needed = len(raw_base64) % 4
                                if padding_needed:
                                    raw_base64 += "=" * (4 - padding_needed)
                                raw_bytes = base64.b64decode(raw_base64)
                                media_chunks.append({"mime_type": mime_type, "data": raw_bytes})
                            
                            if media_chunks:
                                # Hop straight to session send without lock or gate.
                                await session.send(input={"media_chunks": media_chunks})

                        if "clientContent" in msg:
                            # Text context messages (e.g. node description) are always safe
                            async with send_lock:
                                await session.send(
                                    input=types.LiveClientContent(**msg["clientContent"])
                                )
                except WebSocketDisconnect:
                    logging.info("Frontend WebSocket disconnected normally.")
                    # Remove from active session map
                    sid = current_session.get("id")
                    if sid and ACTIVE_SESSION_SOCKETS.get(sid) is websocket:
                        del ACTIVE_SESSION_SOCKETS[sid]
                except Exception as e:
                    import traceback
                    logging.error(f"Error in receive_from_client: {e}\n{traceback.format_exc()}")

            async def receive_from_gemini():
                """Relay Gemini responses and tool calls back to frontend."""
                is_interrupted = False  # Track interruption state for deduplication
                try:
                    while True:
                        turn = session.receive()
                        async for chunk in turn:
                            # Reset interruption flag on new response chunks
                            if chunk.server_content and (chunk.server_content.model_turn or chunk.server_content.turn_complete):
                                is_interrupted = False

                            # 1. ALWAYS check for interruption FIRST — before any audio forwarding
                            #    so the frontend can flush its buffer before stale audio arrives.
                            if chunk.server_content and chunk.server_content.interrupted:
                                if not is_interrupted:
                                    logging.info("Gemini interrupted — signalling frontend to flush.")
                                    await websocket.send_json({"interrupted": True})
                                    is_interrupted = True

                            # 2. Handle Tool Calls
                            if chunk.tool_call:
                                logging.info(f"Tool call received. Tools: {[c.name for c in chunk.tool_call.function_calls]}")
                                try:
                                    responses = []
                                    for call in chunk.tool_call.function_calls:
                                        if call.name == "search_concept":
                                            result = search_concept(**call.args)

                                        elif call.name == "create_mind_map":
                                            # Forward the full map data to React immediately
                                            logging.info(f"create_mind_map called: title='{call.args.get('title')}'")
                                            await websocket.send_json({
                                                "type": "mind_map",
                                                "data": dict(call.args)
                                            })
                                            # Save to session store so it remembers on reconnect
                                            title = call.args.get('title')
                                            if title:
                                                sid = current_session.get("id")
                                                if sid:
                                                    sess = get_or_create_session(sid)
                                                    sess["mind_maps_created"].append({"title": title})
                                                    sess["last_topic"] = title
                                                    
                                            # ACK Gemini instantly so it can resume speaking
                                            result = {
                                                "status": "success",
                                                "message": "Mind map has been rendered on the user's screen."
                                            }

                                        elif call.name == "generate_video":
                                            prompt = call.args.get('prompt')
                                            logging.info(f"generate_video called: prompt='{prompt}'")
                                            await websocket.send_json({
                                                "type": "video_status",
                                                "status": "generating",
                                                "prompt": prompt
                                            })
                                            
                                            async def background_generate_video(p: str):
                                                from app.services.video_service import run_manim_pipeline
                                                logging.info(f"Starting background Manim pipeline for: {p}")
                                                try:
                                                    # Run fully-sync manim pipeline in a background thread to prevent blocking asyncio
                                                    res = await asyncio.to_thread(run_manim_pipeline, p)
                                                    if res.get("status") == "success":
                                                        # Save to session store
                                                        sid = current_session.get("id")
                                                        if sid:
                                                            sess = get_or_create_session(sid)
                                                            sess["videos_generated"].append({"title": res["title"]})
                                                            sess["last_topic"] = res["title"]
                                                        msg = {
                                                            "type": "video_ready",
                                                            "data": {
                                                                "title": res['title'],
                                                                "url": res['url'],
                                                                "solution_steps": res.get('solution_steps', '')
                                                            }
                                                        }
                                                    else:
                                                        logging.error(f"Video generation failed: {res.get('message')}")
                                                        msg = {
                                                            "type": "video_error",
                                                            "message": res.get("message")
                                                        }
                                                        
                                                    # Broadcast result to all newly/currently active client connections
                                                    for active_ws in list(active_clients):
                                                        try:
                                                            await active_ws.send_json(msg)
                                                        except Exception as ws_err:
                                                            logging.error(f"Failed to broadcast video_ready: {ws_err}")
                                                except Exception as e:
                                                    logging.error(f"Error in background_generate_video: {e}")

                                            # Dispatch to background task immediately
                                            asyncio.create_task(background_generate_video(prompt))

                                            result = {
                                                "status": "success",
                                                "message": "Video generation has started silently in the background. Tell the user it is rendering and ask them to stand by for a few moments."
                                            }

                                        elif call.name == "create_menu":
                                            logging.info(f"create_menu called: title='{call.args.get('title')}'")
                                            await websocket.send_json({
                                                "type": "isolated_menu",
                                                "data": dict(call.args)
                                            })
                                            result = {
                                                "status": "success",
                                                "message": "Menu has been displayed as a new screen."
                                            }
                                        elif call.name == "generate_isolated_section":
                                            logging.info(f"generate_isolated_section called: title='{call.args.get('title')}'")
                                            await websocket.send_json({
                                                "type": "isolated_section",
                                                "data": dict(call.args)
                                            })
                                            result = {
                                                "status": "success",
                                                "message": "The new isolated section has been generated and displayed."
                                            }
                                        else:
                                            result = {"error": f"Unknown tool: {call.name}"}

                                        responses.append(types.FunctionResponse(
                                            name=call.name,
                                            id=call.id,
                                            response=result
                                        ))
                                    # Send all tool responses in one batch
                                    await session.send_tool_response(function_responses=responses)
                                    logging.info("Tool responses sent.")
                                except Exception as e:
                                    logging.error(f"Error handling tool call: {e}")
                            #  chunk.data and chunk.text are NOT set on the root — they live inside
                            #  server_content.model_turn.parts as inline_data / text parts.
                            if chunk.server_content and chunk.server_content.model_turn:
                                for part in chunk.server_content.model_turn.parts:
                                    if part.inline_data and part.inline_data.data:
                                        audio_b64 = base64.b64encode(part.inline_data.data).decode("utf-8")
                                        await websocket.send_json({"audio": audio_b64})
                                    if part.text:
                                        await websocket.send_json({"text": part.text})

                            # Fallback: some model variants send audio at chunk.data directly
                            elif chunk.data:
                                audio_b64 = base64.b64encode(chunk.data).decode("utf-8")
                                await websocket.send_json({"audio": audio_b64})
                            elif chunk.text:
                                await websocket.send_json({"text": chunk.text})

                except asyncio.CancelledError:
                    logging.info("receive_from_gemini task was cancelled.")
                except Exception as e:
                    import traceback
                    logging.error(f"Error in receive_from_gemini: {e}\n{traceback.format_exc()}")


            # Run tasks; stop both the moment either finishes
            done, pending = await asyncio.wait(
                [asyncio.create_task(receive_from_client()),
                 asyncio.create_task(receive_from_gemini())],
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()


    except Exception as e:
        logging.error(f"WebSocket session ended: {e}")
    finally:
        active_clients.discard(websocket)
        try:
            await websocket.close()
        except Exception:
            pass
