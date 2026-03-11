from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Any
import json
import logging
import os
import asyncio
import base64

from google import genai
from google.genai import types

from database.chroma_db import chroma_db
from services.embedding_service import embedding_service

router = APIRouter(prefix="/live", tags=["live"])

# Exact model name returned by client.models.list() that supports bidiGenerateContent with Multimodal Vision
LIVE_MODEL = "gemini-2.5-flash-native-audio-latest"

active_clients = set()

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
    active_clients.add(websocket)
    logging.info("Client connected to Python Live Agent Proxy")

    client = genai.Client(http_options={'api_version': 'v1beta'})

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
            ]
        )],
        response_modalities=["AUDIO"],
        media_resolution="MEDIA_RESOLUTION_MEDIUM",
        context_window_compression=types.ContextWindowCompressionConfig(
            trigger_tokens=104857,
            sliding_window=types.SlidingWindow(target_tokens=52428),
        ),
        system_instruction=types.Content(parts=[types.Part.from_text(
            text=(
                "You are a conversational AI tutor embedded in a live Knowledge Graph explorer. "
                "The user's screen (graph images) and microphone audio are streamed to you in real time. "
                "RULES FOR INTERACTION: "
                "- ALWAYS keep each response to 1-2 short sentences. Never deliver a long lecture. "
                "- Start with a single key insight, then STOP and WAIT for the user to react or ask a follow-up. "
                "- If the user navigates to a new node (you will receive a [GRAPH CONTEXT] message), "
                "  just announce it: 'You moved to [node]. It connects to [neighbor1] and [neighbor2].' Then stop. "
                "- If the user asks a question, answer it directly in 1-2 sentences and stop. "
                "- If the user says 'wait', 'hold on', 'stop', or interrupts — stop speaking immediately. "
                "- Be natural and conversational, like a tutor sitting beside the user. "
                "MIND MAP RULES: "
                "- If the user asks to create, make, show, or visualize a mind map about any topic, "
                "  first say 'Let me build that for you...' and briefly speak your reasoning about "
                "  the structure out loud as you think of it. Then call the create_mind_map tool "
                "  with 6-12 well-described nodes. "
                "- IMPORTANT: After the map appears, you MUST explain the structure of the map. "
                "  Clearly explain what the nodes are and how they are related to each other conversationally. "
                "  DO NOT use any Markdown formatting, bolding, or bullet points, as this is a spoken conversation. "
                "- The root node should have id='root' and no parent field. "
                "VIDEO NARRATION RULES: "
                "- If a [SYSTEM MESSAGE] indicates a video is playing, IGNORE the 1-2 short sentence rule completely. "
                "- You MUST provide a continuous, engaging, real-time voiceover narrating exactly what is happening visually frame-by-frame. "
                "- Do NOT stop speaking until the video ends. Flow naturally and match your pacing to the changing visuals."
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
            # ──────────────────────────────────────────────────────────────────────

            async def receive_from_client():
                """Forward frontend audio/images to Gemini, gated by tool_gate."""
                try:
                    while True:
                        data = await websocket.receive_text()
                        msg = json.loads(data)

                        if "realtimeInput" in msg:
                            # Wait until any in-flight tool call has been resolved
                            await tool_gate.wait()
                            chunks = msg["realtimeInput"]["mediaChunks"]
                            for chunk in chunks:
                                mime_type = chunk["mimeType"]
                                if 'image' in mime_type:
                                    logging.info(f"Received image chunk: {mime_type}")
                                raw_bytes = base64.b64decode(chunk["data"])
                                await session.send(input={"mime_type": mime_type, "data": raw_bytes})

                        if "clientContent" in msg:
                            # Text context messages (e.g. node description) are always safe
                            await session.send(
                                input=types.LiveClientContent(**msg["clientContent"])
                            )

                except WebSocketDisconnect:
                    logging.info("Frontend WebSocket disconnected normally.")
                except Exception as e:
                    import traceback
                    logging.error(f"Error in receive_from_client: {e}\n{traceback.format_exc()}")

            async def receive_from_gemini():
                """Relay Gemini responses and tool calls back to frontend."""
                try:
                    while True:
                        turn = session.receive()
                        async for chunk in turn:
                            # 1. ALWAYS check for interruption FIRST — before any audio forwarding
                            #    so the frontend can flush its buffer before stale audio arrives.
                            if chunk.server_content and chunk.server_content.interrupted:
                                logging.info("Gemini interrupted — signalling frontend to flush.")
                                await websocket.send_json({"interrupted": True})

                            # 2. Handle Tool Calls — CLOSE the gate while tool is pending
                            if chunk.tool_call:
                                tool_gate.clear()  # Stop audio forwarding immediately
                                logging.info(f"Tool call received — gate CLOSED. Tools: {[c.name for c in chunk.tool_call.function_calls]}")
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
                                                from services.video_service import run_manim_pipeline
                                                logging.info(f"Starting background Manim pipeline for: {p}")
                                                try:
                                                    # Run fully-sync manim pipeline in a background thread to prevent blocking asyncio
                                                    res = await asyncio.to_thread(run_manim_pipeline, p)
                                                    if res.get("status") == "success":
                                                        msg = {
                                                            "type": "video_ready",
                                                            "data": {
                                                                "title": res['title'],
                                                                "url": res['url']
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

                                        else:
                                            result = {"error": f"Unknown tool: {call.name}"}

                                        responses.append(types.FunctionResponse(
                                            name=call.name,
                                            id=call.id,
                                            response=result
                                        ))
                                    # Send all tool responses in one batch
                                    await session.send(
                                        input=types.LiveClientToolResponse(function_responses=responses)
                                    )
                                    logging.info("Tool responses sent — gate OPEN.")
                                finally:
                                    tool_gate.set()  # Re-open gate whether or not tool succeeded

                            # 3 & 4. Extract Audio and Text from model_turn.parts (SDK v1+)
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
