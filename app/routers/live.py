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

# Exact model name returned by client.models.list() that supports bidiGenerateContent
LIVE_MODEL = "models/gemini-2.5-flash-native-audio-preview-12-2025"

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
                )
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
                "- Be natural and conversational, like a tutor sitting beside the user."
            )
        )])
    )

    try:
        async with client.aio.live.connect(model=LIVE_MODEL, config=config) as session:
            logging.info(f"Successfully connected to Gemini Live with model: {LIVE_MODEL}")

            async def receive_from_client():
                """Forward frontend audio/images to Gemini."""
                try:
                    while True:
                        data = await websocket.receive_text()
                        msg = json.loads(data)

                        if "realtimeInput" in msg:
                            chunks = msg["realtimeInput"]["mediaChunks"]
                            for chunk in chunks:
                                mime_type = chunk["mimeType"]
                                raw_bytes = base64.b64decode(chunk["data"])
                                await session.send(input={"mime_type": mime_type, "data": raw_bytes})

                        if "clientContent" in msg:
                            # Text context message (e.g. node description)
                            await session.send(
                                input=types.LiveClientContent(**msg["clientContent"])
                            )

                except WebSocketDisconnect:
                    logging.info("Frontend WebSocket disconnected normally.")
                except Exception as e:
                    logging.error(f"Error in receive_from_client: {e}")

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
                                # Don't continue — still process tool calls / text in same chunk

                            # 2. Handle Tool Calls
                            if chunk.tool_call:
                                for call in chunk.tool_call.function_calls:
                                    if call.name == "search_concept":
                                        result = search_concept(**call.args)
                                        await session.send(
                                            input=types.LiveClientToolResponse(
                                                function_responses=[types.FunctionResponse(
                                                    name=call.name,
                                                    id=call.id,
                                                    response=result
                                                )]
                                            )
                                        )

                            # 3. Audio — forward PCM audio to the frontend
                            if chunk.data:
                                audio_b64 = base64.b64encode(chunk.data).decode("utf-8")
                                await websocket.send_json({"audio": audio_b64})

                            # 4. Text transcript
                            if chunk.text:
                                await websocket.send_json({"text": chunk.text})

                except asyncio.CancelledError:
                    logging.info("receive_from_gemini task was cancelled.")
                except Exception as e:
                    logging.error(f"Error in receive_from_gemini: {e}")

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
        try:
            await websocket.close()
        except Exception:
            pass
