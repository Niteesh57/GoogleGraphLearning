import os
import subprocess
import json
import uuid
import shutil
import logging
import sys
import tempfile
import re
import hashlib
import sys
import tempfile
import re
from google import genai
from google.genai import types

def generate_solution(prompt: str) -> dict:
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    if not GEMINI_API_KEY:
        return {"solution_steps": "API CONFIG ERROR", "manim_script": "# API Key invalid"}
        
    client = genai.Client(api_key=GEMINI_API_KEY)
    
    system_prompt = '''
    You are an expert Manim educational video scripter. Your job is to write a correct, visually rich Manim animation script.

    LANGUAGE RULE:
    - Detect the language of the user's request.
    - If NOT English, write all on-screen Text labels and titles in that language.
    - Always write solution_steps in English.

    VIDEO LENGTH: Target 1 to 2 minutes total. Use 4 to 7 steps.

    PACING — adaptive wait times only:
    - After each visual step, choose a wait time based on how much is on screen:
      - Simple diagram or single label: self.wait(3)
      - Mid-complexity (multiple shapes + labels): self.wait(5)
      - Dense or multi-part scene: self.wait(7)
    - Never hardcode every step to the same wait value. Vary it naturally.
    - The narrating AI reads the on-screen text aloud, so wait long enough for it to speak what is written.

    SUPPORTED MANIM PRIMITIVES — use freely, pick what fits your topic best:
    - Shapes: Circle, Rectangle, Square, Triangle, Polygon, Line, Arrow, DoubleArrow, Dot, Ellipse, Arc
    - Graphs: Axes (with axes.plot(), axes.get_graph_label()), axes.coords_to_point(x, y)
    - Text: Text(...) ONLY. NEVER use MathTex, Tex, DecimalNumber, Integer, or Matrix.
    - Layout: .to_edge(), .next_to(obj, direction, buff=0.5), .shift(), .move_to(), .center()
    - Grouping: VGroup(...).arrange(DOWN/RIGHT/UP, buff=0.5)
    - Animations: Write, Create, FadeIn, FadeOut, Transform, ReplacementTransform, GrowArrow, DrawBorderThenFill, Indicate, Flash
    - Colors: BLUE, RED, GREEN, YELLOW, WHITE, ORANGE, GRAY, PURPLE, PINK, TEAL

    BANNED — these crash and must NEVER appear:
    - MathTex, Tex, DecimalNumber, Integer, Matrix
    - get_part_by_text, get_parts_by_text, .t2c, .t2f, .t2s (any substring selection/methods)
    - Axes.add_coordinates(), NumberLine.add_numbers(), FunctionGraph, ValueTracker
    - MoveAlongPath, get_mobjects_from_last_play, .reverse(), .to_center(), self.add_sound()
    
    TEXT RULES:
    - font_size=32 for titles, font_size=24 for body text. Never use default 48.
    - Max 40 characters per line. Wrap long text with "\\n" manually.
    - CRITICAL: Never overlap text or shapes. Use .next_to() or .arrange() with buff >= 0.4.
    - WORD ISOLATION: To highlight or move a specific word, DO NOT use get_part_by_text. 
      Instead, create each word as a separate Text("word") object and put them in a VGroup().arrange(RIGHT, buff=0.1).

    SPATIAL AWARENESS & LAYOUT:
    - Screen is 14 units wide (LEFT=-7 to RIGHT=7) and 8 units high (BOTTOM=-4 to TOP=4).
    - If a scene becomes crowded, FadeOut previous elements before adding new ones.
    - For lists or stacks of text, ALWAYS use VGroup(text1, text2, ...).arrange(DOWN, center=True, buff=0.5) to ensure zero overlap.
    - Title should always be at .to_edge(UP). All other content should be below it.

    ANIMATION RULES:
    - GrowArrow(obj): Use ONLY for a single Arrow object. NEVER use it on a VGroup.
    - To animate multiple arrows or a VGroup, use Create(vgroup) instead.
    - Use run_time=1.5 or 2 for complex transformations to give the user time to see them.

    STRUCTURE (follow this pattern, adapt freely):
    from manim import *

    class GenScene(Scene):
        def construct(self):
            self.camera.background_color = "#0E1117"

            # STEP 1 — introduce the topic
            title = Text("Topic Title", font_size=32).to_edge(UP)
            # ... build relevant shapes/graphs/diagrams for this step
            self.play(Write(title), Create(obj), run_time=2)
            self.wait(5)  # pick wait based on density
            self.play(FadeOut(title), FadeOut(obj))

            # STEP 2 ... (4–7 steps total)

    OUTPUT — valid JSON only, no markdown fences:
    {"solution_steps": "Step 1: ...\\nStep 2: ...", "manim_script": "from manim import *\\n\\nclass GenScene(Scene):\\n    def construct(self):\\n        ..."}
    '''

    try:
        response = client.models.generate_content(
            model='gemini-2.5-pro',
            contents=system_prompt + "\n\nUser Request: " + prompt
        )
        
        text = ""
        if hasattr(response, 'text') and response.text:
            text = response.text
        elif response.candidates and response.candidates[0].content.parts:
            text = response.candidates[0].content.parts[0].text
            
        text = text.replace("```json", "").replace("```", "").strip()
        result = json.loads(text)
        return result
    except Exception as e:
        logging.error(f"Error generating video solution: {e}")
        return {
            "status": "error",
            "message": f"Error generating solution: {e}",
            "solution_steps": "",
            "manim_script": ""
        }

def run_manim_pipeline(prompt: str) -> dict:
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    if not GEMINI_API_KEY:
         return {"status": "error", "message": "API key not found."}

    # 1. Check Cache
    clean_prompt = "".join(char for char in prompt.lower().strip() if char.isalnum() or char.isspace())
    prompt_hash = hashlib.md5(clean_prompt.encode('utf-8')).hexdigest()[:12]
    
    # Check if the video is already statically served
    final_dir = os.path.join(os.path.dirname(__file__), "..", ".generated_videos")
    os.makedirs(final_dir, exist_ok=True)
    expected_video_path = os.path.join(final_dir, f"GenScene_{prompt_hash}.mp4")
    
    if os.path.exists(expected_video_path):
        logging.info(f"Video Cache HIT for prompt '{prompt}'. Serving existing instance.")
        return {
            "status": "success",
            "title": prompt,
            "url": f"http://localhost:8000/videos/GenScene_{prompt_hash}.mp4",
            "solution_steps": f"This video explains: {prompt}. The animation uses visual diagrams to walk through the key concepts step by step."
        }

    # 2. Generate Solution
    logging.info(f"Video Cache MISS. Generating Manim solution with prompt: {prompt}")
    result = generate_solution(prompt)
    if result.get("status") == "error":
        return result

    script_code = result.get("manim_script", "")
    
    if not script_code:
        return {"status": "error", "message": "Failed to generate python Manim script."}

    # 3. Setup Workspace (Use OS temp directory to completely avoid Uvicorn WatchFiles reload)
    job_id = prompt_hash
    work_dir = os.path.join(tempfile.gettempdir(), f"manim_work_{job_id}")
    os.makedirs(work_dir, exist_ok=True)

    script_filename = os.path.join(work_dir, "generated_scene.py")
    with open(script_filename, "w", encoding="utf-8") as f:
        f.write(script_code)
        
    # 3. Execute Manim (-qm for medium quality / faster rendering during live agent use)
    output_filename = f"GenScene_{job_id}.mp4"
    cmd = [sys.executable, "-m", "manim", "-qm", "--media_dir", ".", "-o", output_filename, "generated_scene.py", "GenScene"]
    
    logging.info("Starting Manim Subprocess...")
    try:
        process = subprocess.run(cmd, cwd=work_dir, capture_output=True, text=True)
        if process.returncode != 0:
            logging.error(f"Manim Execution Error STDOUT: {process.stdout}\nSTDERR: {process.stderr}")
            return {"status": "error", "message": f"Video rendering failed. Log: {process.stdout[-200:] if process.stdout else process.stderr[-200:] if process.stderr else 'Unknown Error'}"}
    except Exception as e:
        import traceback
        logging.error(f"Manim execution failed: {e}\n{traceback.format_exc()}")
        return {"status": "error", "message": str(e)}

    # Find the output video (Manim might nest it under videos/generated_scene/720p30/)
    source_path = ""
    for root, dirs, files in os.walk(work_dir):
        if output_filename in files:
            source_path = os.path.join(root, output_filename)
            break
            
    if not source_path:
        return {"status": "error", "message": "Could not locate output video after generation."}
        
    os.makedirs(".generated_videos", exist_ok=True)
    final_video_path = os.path.join(".generated_videos", output_filename)
    shutil.move(source_path, final_video_path)
    
    # Cleanup memory-heavy intermediate work dir (logs, audio, scripts)
    try:
        shutil.rmtree(work_dir)
    except Exception as e:
        logging.warning(f"Failed to clean up work dir: {e}")
        
    return {
        "status": "success",
        "url": f"http://localhost:8000/videos/{output_filename}",
        "title": prompt.strip()[:40] + ("..." if len(prompt) > 40 else ""),
        "solution_steps": result.get("solution_steps", "")
    }
