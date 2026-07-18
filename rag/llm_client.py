from typing import AsyncGenerator, List, Dict, Any, Optional
import json
import httpx
import logging
from config import settings

logger = logging.getLogger(__name__)


class LLMClient:
    """Handles LLM API calls with Groq primary and Gemini fallback"""

    def __init__(self):
        self.groq_api_key = settings.groq_api_key
        self.gemini_api_key = settings.gemini_api_key
        self.timeout = settings.groq_timeout

    async def generate_response(
        self,
        query: str,
        context_chunks: List[Dict[str, Any]],
        language: str = "en",
        model_tier: str = "simple",
        history: Optional[List[Dict[str, str]]] = None,
    ) -> Dict[str, Any]:
        """
        Generate AI response using retrieved context

        Args:
            query: User's question
            context_chunks: Retrieved document chunks
            language: Response language (en/bn)
            model_tier: Model complexity (simple/long/complex)

        Returns:
            Dict with response text, citations, and metadata
        """
        # Build prompt with context
        prompt = self._build_prompt(query, context_chunks, language, history)

        # Select model based on tier
        model = self._select_model(model_tier)

        # Try Groq first
        if self.groq_api_key:
            try:
                response = await self._call_groq(prompt, model)
                return {
                    "response": response,
                    "model_used": f"groq/{model}",
                    "citations": self._extract_citations(context_chunks),
                    "source_doc_ids": [
                        str(chunk["item_id"]) for chunk in context_chunks
                    ],
                }
            except Exception as e:
                logger.warning(f"Groq API failed: {e}. Falling back to Gemini.")

        # Fallback to Gemini
        if self.gemini_api_key:
            try:
                response = await self._call_gemini(prompt)
                return {
                    "response": response,
                    "model_used": f"gemini/{settings.gemini_model}",
                    "citations": self._extract_citations(context_chunks),
                    "source_doc_ids": [
                        str(chunk["item_id"]) for chunk in context_chunks
                    ],
                }
            except Exception as e:
                logger.error(f"Gemini API also failed: {e}")

        # Both failed - return keyword-only results
        return {
            "response": self._fallback_response(context_chunks, language),
            "model_used": "fallback/keyword-only",
            "citations": self._extract_citations(context_chunks),
            "source_doc_ids": [str(chunk["item_id"]) for chunk in context_chunks],
        }

    async def stream_response(
        self,
        query: str,
        context_chunks: List[Dict[str, Any]],
        language: str = "en",
        model_tier: str = "simple",
        history: Optional[List[Dict[str, str]]] = None,
    ) -> AsyncGenerator[str, None]:
        """Stream the LLM answer as text deltas.

        Tries Groq token streaming first. If Groq fails *before* any token is
        emitted, falls back to the non-streaming path (Groq retry -> Gemini ->
        keyword) and yields the whole answer at once. A mid-stream failure just
        stops (the partial text already reached the client)."""
        prompt = self._build_prompt(query, context_chunks, language, history)
        model = self._select_model(model_tier)

        yielded = False
        if self.groq_api_key:
            try:
                async for delta in self._stream_groq(prompt, model):
                    yielded = True
                    yield delta
                return
            except Exception as e:  # noqa: BLE001
                logger.warning(f"Groq stream failed: {e}. Falling back.")
                if yielded:
                    return  # partial already sent — don't double up

        result = await self.generate_response(
            query, context_chunks, language, model_tier, history
        )
        yield result["response"]

    async def _stream_groq(self, prompt: str, model: str) -> AsyncGenerator[str, None]:
        """Yield content deltas from Groq's OpenAI-compatible SSE stream."""
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.groq_api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.3,
            "max_tokens": 1024,
            "stream": True,
        }
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            async with client.stream("POST", url, json=payload, headers=headers) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    data = line[len("data:"):].strip()
                    if data == "[DONE]":
                        break
                    try:
                        obj = json.loads(data)
                        delta = obj["choices"][0]["delta"].get("content")
                    except Exception:  # noqa: BLE001
                        continue
                    if delta:
                        yield delta

    def _build_prompt(
        self,
        query: str,
        context_chunks: List[Dict[str, Any]],
        language: str,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> str:
        """Build the RAG prompt with context and instructions"""
        system_prompt = """You are the CSEDU Knowledge Assistant for the Department of Computer Science and Engineering at the University of Dhaka.

Answer the user's question directly, accurately, and intelligently using ONLY the provided context.

Each context entry is tagged with its category in [brackets]:
- [book] Library catalog books
- [archive] Digital archive items
- [research] Research papers
- [project] Student projects

RULES:
1. Answer ONLY what the user asked. Ignore context entries that are not relevant to the question.
2. If the user asks about a specific category (e.g. the digital archive, research papers, student projects, or library books), discuss ONLY items from that category. Do not mention items from other categories.
3. Synthesize a clear, concise answer in natural prose. Do NOT dump raw metadata or repeat the same item more than once.
4. Only produce a full list of items when the user explicitly asks to list, show, or browse them; otherwise answer conversationally.
5. Cite the sources you actually use by their title in [brackets].
6. If the context does not contain the answer, say so briefly and honestly. Never invent resources or facts."""

        # Build context section, tagged by item category so the model can filter by relevance
        seen = set()
        lines = []
        for chunk in context_chunks:
            category = chunk.get("item_type") or chunk.get("source", "unknown")
            key = (category, chunk["title"].strip().lower(), chunk["chunk_text"][:120])
            if key in seen:
                continue
            seen.add(key)
            lines.append(f"[{category}] {chunk['title']}\n{chunk['chunk_text']}")
        context_text = "\n\n".join(lines)

        # Language instruction
        lang_instruction = {
            "en": "Answer in English.",
            "bn": "Answer in Bengali (বাংলা).",
            "auto": "Answer in the same language as the question.",
        }.get(language, "Answer in English.")

        # FR-AI-008: include prior exchanges so follow-up questions
        # ("what about the second one?") resolve against the conversation.
        history_text = ""
        if history:
            turns = []
            for turn in history[-10:]:
                turns.append(f"User: {turn['query']}\nAssistant: {turn['response']}")
            history_text = (
                "Previous conversation (for context — do not repeat it):\n"
                + "\n\n".join(turns)
                + "\n\n"
            )

        user_prompt = f"""{history_text}Context Documents:
{context_text}

Question: {query}

Instructions: {lang_instruction} Cite the sources you use by their title in [brackets]. Stay focused on the question."""

        return f"{system_prompt}\n\n{user_prompt}"

    def _select_model(self, tier: str) -> str:
        """Select Groq model based on complexity tier"""
        models = {
            "simple": settings.groq_model_simple,
            "long": settings.groq_model_long,
            "complex": settings.groq_model_complex,
        }
        return models.get(tier, settings.groq_model_simple)

    async def _call_groq(self, prompt: str, model: str) -> str:
        """Call Groq API"""
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.groq_api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.3,
            "max_tokens": 1024,
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]

    async def _call_gemini(self, prompt: str) -> str:
        """Call Gemini API as fallback"""
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}:generateContent?key={self.gemini_api_key}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.3, "maxOutputTokens": 1024},
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()
            return data["candidates"][0]["content"]["parts"][0]["text"]

    def _extract_citations(
        self, context_chunks: List[Dict[str, Any]]
    ) -> List[Dict[str, str]]:
        """Extract citation information from context chunks"""
        citations = []
        seen_items = set()

        for chunk in context_chunks:
            item_id = str(chunk["item_id"])
            if item_id not in seen_items:
                citations.append(
                    {
                        "item_id": item_id,
                        "title": chunk["title"],
                        "item_type": chunk["item_type"],
                    }
                )
                seen_items.add(item_id)

        return citations

    def _fallback_response(
        self, context_chunks: List[Dict[str, Any]], language: str
    ) -> str:
        """Generate fallback response when both LLMs fail"""
        if language == "bn":
            prefix = "দুঃখিত, AI সেবা সাময়িকভাবে অনুপলব্ধ। এখানে প্রাসঙ্গিক নথি রয়েছে:\n\n"
        else:
            prefix = "Sorry, AI service is temporarily unavailable. Here are relevant documents:\n\n"

        docs = "\n".join(
            [f"• {chunk['title']} [{chunk['item_id']}]" for chunk in context_chunks[:5]]
        )

        return prefix + docs

    async def rewrite_query(self, query: str, language: str = "en") -> str:
        """
        Rewrite ambiguous queries for better retrieval
        Uses Gemini for query refinement
        """
        if not self.gemini_api_key:
            return query  # No rewriting if no API key

        prompt = f"""Rewrite this search query to be more specific and clear for academic document retrieval.
Keep it concise (max 100 words). Preserve the original language.

Original query: {query}

Rewritten query:"""

        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key={self.gemini_api_key}"
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.1, "maxOutputTokens": 150},
            }

            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                data = response.json()
                rewritten = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                logger.info(f"Query rewritten: '{query}' -> '{rewritten}'")
                return rewritten
        except Exception as e:
            logger.warning(f"Query rewriting failed: {e}. Using original query.")
            return query


# Global LLM client instance
llm_client = LLMClient()
