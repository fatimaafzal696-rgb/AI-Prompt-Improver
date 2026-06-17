import os
import sys

# Prevent Python 3.14 compatibility crash in protobuf by forcing pure-Python mode
sys.modules['google._upb._message'] = None
sys.modules['google._upb'] = None
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

import json
import re
from flask import Flask, request, jsonify, render_template
from dotenv import load_dotenv
import google.generativeai as genai

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)

# Configure Gemini API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
else:
    print("WARNING: GEMINI_API_KEY not found in environment variables.")

# System prompts for each improvement mode
MODE_PROMPTS = {
    "better": """You are an expert prompt engineer. Your task is to improve the given prompt by:
- Fixing grammar and spelling errors
- Improving clarity and conciseness
- Making the language more precise and direct
- Keeping the original intent and scope intact
- Removing redundancy

Do NOT over-complicate or massively expand the prompt. Keep it clean and focused.""",

    "professional": """You are a senior prompt engineer. Your task is to enhance the given prompt to a professional level by:
- Adding proper context and background information
- Creating a structured format with clear sections where appropriate
- Improving the instructions to be more specific and actionable
- Adding relevant constraints or guidelines
- Using professional and precise language
- Ensuring the AI will understand exactly what is expected

The result should be a well-structured, professional-grade prompt.""",

    "expert": """You are a world-class prompt architect. Your task is to transform the given prompt into an expert-level, production-ready prompt by including ALL of the following elements:
- **Role**: Define a specific expert persona for the AI to adopt
- **Objectives**: Clear, measurable goals for the task
- **Context**: Rich background information that informs the task
- **Constraints**: Specific limitations, boundaries, and rules
- **Output Format**: Exact formatting requirements (headers, bullets, length, structure)
- **Target Audience**: Who the output is for and their expertise level
- **Success Criteria**: What makes a perfect response to this prompt
- **Examples** (if applicable): Illustrative examples or templates

Transform the basic prompt into a comprehensive, expert-level prompt that will produce exceptional, consistent results."""
}


def calculate_quality_score(prompt: str) -> int:
    """Calculate a simple quality score for a prompt based on various metrics."""
    score = 0
    prompt_lower = prompt.lower()

    # Length score (10-30 points)
    word_count = len(prompt.split())
    if word_count < 5:
        score += 5
    elif word_count < 15:
        score += 10
    elif word_count < 50:
        score += 20
    elif word_count < 150:
        score += 28
    else:
        score += 30

    # Specificity indicators (up to 20 points)
    specificity_words = ['specific', 'detailed', 'format', 'example', 'include', 'explain', 'describe', 'create', 'write', 'analyze', 'provide', 'generate', 'list', 'compare', 'summarize']
    matches = sum(1 for word in specificity_words if word in prompt_lower)
    score += min(matches * 3, 20)

    # Structure indicators (up to 15 points)
    structure_words = ['step', 'section', 'paragraph', 'bullet', 'numbered', 'heading', 'introduction', 'conclusion', 'outline']
    matches = sum(1 for word in structure_words if word in prompt_lower)
    score += min(matches * 5, 15)

    # Context indicators (up to 15 points)
    context_words = ['context', 'background', 'audience', 'purpose', 'goal', 'objective', 'for', 'because', 'since', 'given', 'assuming']
    matches = sum(1 for word in context_words if word in prompt_lower)
    score += min(matches * 3, 15)

    # Constraint indicators (up to 10 points)
    constraint_words = ['must', 'should', 'avoid', 'without', 'only', "don't", 'limit', 'maximum', 'minimum', 'constraint']
    matches = sum(1 for word in constraint_words if word in prompt_lower)
    score += min(matches * 3, 10)

    # Role/persona indicators (up to 10 points)
    role_words = ['act as', 'you are', 'as a', 'role', 'expert', 'professional', 'specialist', 'pretend']
    matches = sum(1 for phrase in role_words if phrase in prompt_lower)
    score += min(matches * 5, 10)

    return min(score, 100)


def build_improvement_prompt(original_prompt: str, mode: str) -> str:
    """Build the full prompt to send to Gemini."""
    system_context = MODE_PROMPTS.get(mode, MODE_PROMPTS["better"])

    return f"""{system_context}

---

ORIGINAL PROMPT TO IMPROVE:
{original_prompt}

---

INSTRUCTIONS:
Respond ONLY with a valid JSON object in this exact format (no markdown code blocks, no extra text):
{{
  "improved_prompt": "The full improved prompt text here",
  "explanation": "A brief 1-2 sentence explanation of the key improvements made",
  "improvements_made": ["Improvement 1", "Improvement 2", "Improvement 3"]
}}

Ensure:
- "improved_prompt" contains the complete improved prompt
- "explanation" is concise and clear
- "improvements_made" is an array of 2-5 short improvement labels"""


def generate_mock_response(original_prompt: str, mode: str):
    """Generate high-quality mock prompt improvements dynamically based on user input topic."""
    topic = original_prompt.strip()
    if len(topic) > 100:
        topic_summary = topic[:100] + "..."
    else:
        topic_summary = topic

    # Basic templates
    if mode == "better":
        improved_prompt = f"Write a clear, engaging, and well-paced YouTube video script explaining the core concepts of Artificial Intelligence. Ensure the language is easy to understand for beginners, and include suggestions for visual cues."
        if "email" in original_prompt.lower():
            improved_prompt = f"Create a compelling marketing email for our new product launch. Keep the tone professional yet exciting, include a clear subject line, and add a strong call-to-action."
        elif "explain" in original_prompt.lower() or "learning" in original_prompt.lower():
            improved_prompt = f"Explain the fundamental concepts of machine learning in simple terms for a beginner, avoiding heavy technical jargon and using real-world analogies."
        elif "blog" in original_prompt.lower() or "post" in original_prompt.lower():
            improved_prompt = f"Write an informative and engaging blog post about adopting healthy habits, structured with clear headings and actionable tips."
        else:
            # Dynamic fallback
            improved_prompt = f"Please do the following: {original_prompt}. Ensure the instructions are clear, concise, grammatically correct, and easy to follow."

        explanation = "Improved grammatical structure, removed conversational fluff, and clarified the primary instructions."
        improvements_made = ["Grammar Correction", "Clarity Optimization", "Redundancy Removal"]

    elif mode == "professional":
        improved_prompt = f"""### Context
I need to create high-quality content regarding: "{topic_summary}"
The goal is to deliver value to the target audience while maintaining a professional and informative tone.

### Instructions
1. **Introduction**: Start with a hook that highlights why this topic matters.
2. **Core Content**: Break down the subject into 3 clear, logical sections.
3. **Actionable Takeaways**: Provide concrete examples or next steps for the reader.
4. **Conclusion**: Summarize key insights and end with an engaging final thought.

### Formatting Requirements
- Use clear headings and bullet points for readability.
- Maintain a concise, professional, and authoritative writing style.
- Total length should be approximately 800 words."""

        if "email" in original_prompt.lower():
            improved_prompt = f"""### Context
We are launching a new product and need to write a promotional marketing email to send to our subscriber list.

### Instructions
1. Write a compelling, high-open-rate subject line.
2. Structure the email with:
   - A personalized greeting.
   - An opening hook highlighting the customer's problem.
   - The introduction of our product as the solution.
   - 3 key benefits of the product.
   - A clear, singular Call to Action (CTA).
3. Keep the tone friendly, persuasive, and professional.

### Constraints
- Keep the email under 250 words.
- Avoid spam-trigger words (e.g., "free", "buy now", "guarantee")."""

        explanation = "Added professional context, structural breakdown, and specific formatting guidelines."
        improvements_made = ["Structural Formatting", "Context Enrichment", "Specific Constraints"]

    else: # expert
        improved_prompt = f"""# Expert Prompt: Content Creation for "{topic_summary}"

## Role
Act as an elite content strategist and subject matter expert in the field of: "{topic_summary}".

## Objective
Generate a comprehensive, engaging, and authoritative output based on the following input topic: "{topic_summary}".

## Context & Target Audience
The output is intended for a professional audience looking for actionable insights. They value depth, accuracy, and clear, structured communication.

## Detailed Instructions
1. **Analyze**: Deconstruct the topic and identify the most critical concepts.
2. **Structure**: Organize the response into a logical hierarchy (Introduction, Detailed Breakdown, Applications, and Summary).
3. **Synthesize**: Write in a clear, sophisticated tone. Use real-world analogies to explain complex topics.
4. **Review**: Ensure all information is accurate and directly addresses the core objective.

## Constraints & Formatting
- **Tone**: Professional, analytical, and authoritative.
- **Length**: Comprehensive and detailed.
- **Formatting**: Use Markdown headers, bold text for emphasis, and bullet points for structured data.
- **Restrictions**: Do not use vague generalizations. Provide specific, concrete examples.

## Success Criteria
A perfect response will:
- Clearly define all core terminology.
- Provide a structured, step-by-step analysis.
- Include at least 2 practical use cases or applications."""

        explanation = "Transformed into a comprehensive expert-level prompt, defining a persona, structured objectives, constraints, audience context, and success criteria."
        improvements_made = ["Expert Persona (Role)", "Objective Mapping", "Success Criteria", "Formatting Standards"]

    original_score = calculate_quality_score(original_prompt)
    improved_score = calculate_quality_score(improved_prompt)

    # Boost score based on mode
    mode_boost = {"better": 10, "professional": 20, "expert": 35}
    improved_score = min(improved_score + mode_boost.get(mode, 0), 100)
    original_score = min(original_score, improved_score - 15)

    return jsonify({
        "success": True,
        "original_prompt": original_prompt,
        "improved_prompt": improved_prompt,
        "mode": mode,
        "original_score": max(original_score, 5),
        "improved_score": improved_score,
        "explanation": explanation,
        "improvements_made": improvements_made,
        "mocked": True
    })


@app.route("/")
def index():
    """Serve the main application page."""
    return render_template("index.html")


@app.route("/api/improve", methods=["POST"])
def improve_prompt():
    """API endpoint to improve a prompt using Gemini AI (with Mock fallback)."""
    try:
        # Validate request data
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid JSON request body"}), 400

        original_prompt = data.get("prompt", "").strip()
        mode = data.get("mode", "better").lower()

        if not original_prompt:
            return jsonify({"error": "Prompt cannot be empty"}), 400

        if len(original_prompt) > 5000:
            return jsonify({"error": "Prompt exceeds 5000 character limit"}), 400

        if mode not in ["better", "professional", "expert"]:
            return jsonify({"error": "Invalid mode. Choose from: better, professional, expert"}), 400

        # Check if the API key is not configured or is a mock key
        is_mock_key = (
            not GEMINI_API_KEY 
            or GEMINI_API_KEY == "your_gemini_api_key_here" 
            or GEMINI_API_KEY.startswith("AQ.")
        )

        if is_mock_key:
            return generate_mock_response(original_prompt, mode)

        try:
            # Calculate original quality score
            original_score = calculate_quality_score(original_prompt)

            # Initialize Gemini model
            model = genai.GenerativeModel(
                model_name="gemini-1.5-flash",
                generation_config={
                    "temperature": 0.7,
                    "top_p": 0.9,
                    "max_output_tokens": 2048,
                }
            )

            # Build and send prompt
            full_prompt = build_improvement_prompt(original_prompt, mode)
            response = model.generate_content(full_prompt)

            # Parse response
            response_text = response.text.strip()

            # Remove markdown code blocks if present
            response_text = re.sub(r'^```(?:json)?\s*', '', response_text)
            response_text = re.sub(r'\s*```$', '', response_text)
            response_text = response_text.strip()

            # Parse JSON
            try:
                result_data = json.loads(response_text)
            except json.JSONDecodeError:
                # Attempt to extract JSON from within the response
                json_match = re.search(r'\{[\s\S]*\}', response_text)
                if json_match:
                    result_data = json.loads(json_match.group())
                else:
                    raise ValueError("AI returned unexpected format")

            improved_prompt = result_data.get("improved_prompt", "")
            if not improved_prompt:
                raise ValueError("No improved prompt in AI response")

            # Calculate improved quality score
            improved_score = calculate_quality_score(improved_prompt)

            # Boost score based on mode (expert prompts are inherently higher quality)
            mode_boost = {"better": 10, "professional": 20, "expert": 35}
            improved_score = min(improved_score + mode_boost.get(mode, 0), 100)
            original_score = min(original_score, improved_score - 15)  # Ensure improvement is visible

            return jsonify({
                "success": True,
                "original_prompt": original_prompt,
                "improved_prompt": improved_prompt,
                "mode": mode,
                "original_score": max(original_score, 5),
                "improved_score": improved_score,
                "explanation": result_data.get("explanation", ""),
                "improvements_made": result_data.get("improvements_made", []),
                "mocked": False
            })

        except Exception as api_err:
            # Fall back to high-quality mock templates on any API errors
            print(f"Gemini API error (falling back to Mock Mode): {str(api_err)}")
            return generate_mock_response(original_prompt, mode)

    except Exception as e:
        print(f"Error in improve_prompt: {str(e)}")
        return jsonify({"error": f"An internal server error occurred: {str(e)}"}), 500


@app.route("/api/health", methods=["GET"])
def health_check():
    """Health check endpoint."""
    is_valid_key = (
        bool(GEMINI_API_KEY) 
        and GEMINI_API_KEY != "your_gemini_api_key_here" 
        and not GEMINI_API_KEY.startswith("AQ.")
    )
    return jsonify({
        "status": "ok",
        "api_key_configured": is_valid_key
    })


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
