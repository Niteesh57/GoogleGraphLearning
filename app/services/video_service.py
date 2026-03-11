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
    You are an expert Universal Educational Video Creator and Manim developer. 
    Your task is to visualize ANY topics (Neural Networks, AI, Math, Physics, or general storytelling like cats/kings/gravity) using clear diagrams and animations.
    1. SOLVE or EXPLAIN the user's prompt step-by-step in clear text (in English - for the JSON response).
    2. Write a COMPLETE, RUNNABLE Manim Python script to visualize it WITH DIAGRAMS & ANIMATIONS.

    CRITICAL LANGUAGE REQUIREMENTS - AUTOMATIC LANGUAGE DETECTION:
    - **DETECT the language of the user's input question**
    - **USE THE SAME LANGUAGE for both video and audio**
    - **The solution_steps in the JSON response should always be in English**

    IMPORTANT: The system DOES NOT have LaTeX installed.
    You MUST NOT use `MathTex`, `Tex`, `DecimalNumber`, `Integer`, or `Matrix`.
    You MUST NOT use `Axes.add_coordinates()` or `NumberLine.add_numbers()` because they use DecimalNumber internally and will crash.
    You MUST use `Text` for all text, numbers, and equations.
    To display changing numbers or weights, cast them to strings like `Text(str(round(weight,2)))` instead of using tracking ValueTrackers with DecimalNumbers.
    To label axes, manually place `Text` objects near the ticks.

    MANIM SCRIPT RULES:
    1. **Visual Design (DIAGRAMS + TEXT)**:
       - **Adapt to the Topic**: 
         - **Machine Learning**: Use `Circle` for neurons, `VGroup` for layers, `Line` with `stroke_opacity=0.5` for weights.
         - **Physics/Math**: Use arrows for forces/vectors, `Rectangle` or `Circle` for objects (like an apple falling).
         - **General Storytelling (Cats, Kings, etc.)**: Use simple shapes (`Circle`, `Rectangle`, `Dot`, `Star`, `Polygon`), standard `SVGMobject` (if available), or `Text` labels to represent characters, objects, or concepts.
       - **3D Scenes**: You may use `ThreeDScene`, `Sphere`, `ThreeDAxes`, and `set_camera_orientation` if the prompt requires 3D visualization.
       - **Graphing (CRITICAL)**: NEVER use `FunctionGraph` or `input_to_graph_point`. ALWAYS use `Axes` and `axes.plot(func)`. To get a coordinate point on the graph, you MUST use `axes.c2p(x, y)` or `axes.coords_to_point(x, y)`.

    2. **Safe Area & Text Handling (CRITICAL)**:
       - Limit lines to 40 characters. Insert line breaks manually. Use triple quotes for Text strings.
       - NEVER let Text, titles, or equations overflow the screen width.
       - Use `font_size=36` (or smaller) for long text instead of the default 48.
       - If a formula, graph, or text group is very wide, ALWAYS append `.scale_to_fit_width(config.frame_width - 2)`.
       - NEVER use `.to_center()`. It is deprecated. Use `.center()` instead.

    3. **Presentation Style & LIVE VISION NARRATION (CRITICAL)**:
       - **STEP STRUCTURE**:
         ```python
         # Create all objects
         self.play(Write(title), Create(diagram), run_time=2)
         self.wait(5)  # MUST wait after major visual events for the Live AI to narrate it!
         self.play(FadeOut(title), FadeOut(diagram), run_time=1)
         self.wait(1)
         ```
       - **WAIT TIMES ARE CRITICAL**: Each major visual change MUST be followed by `self.wait(5)` or more. This allows the multimodal AI watching the video sufficient time to formulate and speak a narration.
       - DO NOT use `self.add_sound()`. 

    4. **Animations to Use**:
       - ALWAYS ensure animations have positive run_time (minimum 0.1, typical 1-3). NEVER use run_time=0.

    OUTPUT FORMAT:
    You MUST return a valid JSON object with the following structure:
    {
        "solution_steps": "Step 1: ...\\nStep 2: ...",
        "manim_script": "from manim import *\\n\\nclass GenScene(Scene):\\n   def construct(self):\\n       self.camera.background_color = '#0E1117'\\n\\n       # STEP 1\\n       title = Text('Neural Network', font_size=48).to_edge(UP)\\n       input_node = Circle(radius=0.3, color=BLUE)\\n       self.play(Write(title), Create(input_node))\\n       self.wait(5)\\n       self.play(FadeOut(title), FadeOut(input_node))\\n       self.wait(1)\\n       ..."
    }

    Do NOT include any markdown formatting (like ```json ... ```) in the JSON string values.
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
            "url": f"/videos/GenScene_{prompt_hash}.mp4"
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
    cmd = ["manim", "-qm", "--media_dir", ".", "-o", output_filename, "generated_scene.py", "GenScene"]
    
    logging.info("Starting Manim Subprocess...")
    try:
        # Use shell=True so Windows resolves the 'manim' executable from the global venv PATH
        process = subprocess.run(cmd, cwd=work_dir, capture_output=True, text=True, shell=True)
        if process.returncode != 0:
            logging.error(f"Manim Execution Error: {process.stderr}")
            return {"status": "error", "message": "Video rendering failed in Manim compiler."}
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
        "title": prompt.strip()[:40] + ("..." if len(prompt) > 40 else "")
    }
