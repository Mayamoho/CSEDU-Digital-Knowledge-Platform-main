from typing import List, Dict, Any, Optional
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
        model_tier: str = "simple"
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
        prompt = self._build_prompt(query, context_chunks, language)
        
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
                    "source_doc_ids": [chunk["item_id"] for chunk in context_chunks]
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
                    "source_doc_ids": [chunk["item_id"] for chunk in context_chunks]
                }
            except Exception as e:
                logger.error(f"Gemini API also failed: {e}")
        
        # Both failed - return keyword-only results
        return {
            "response": self._fallback_response(context_chunks, language),
            "model_used": "fallback/keyword-only",
            "citations": self._extract_citations(context_chunks),
            "source_doc_ids": [chunk["item_id"] for chunk in context_chunks]
        }

    def _build_prompt(
        self,
        query: str,
        context_chunks: List[Dict[str, Any]],
        language: str
    ) -> str:
        """Build the RAG prompt with context and instructions"""
        system_prompt = """You are the CSEDU Knowledge Assistant, an AI helper for the Department of Computer Science and Engineering at the University of Dhaka.

Your responsibilities:
1. Answer questions ONLY using the provided context documents
2. Cite sources using [Document ID] format for every factual claim
3. If the context doesn't contain the answer, say so honestly
4. Never hallucinate or make up information
5. Be concise and accurate

Remember: You can only reference information from the provided context."""

        # Build context section
        context_text = "\n\n".join([
            f"[{chunk['item_id']}] {chunk['title']}\n{chunk['chunk_text']}"
            for chunk in context_chunks
        ])

        # Language instruction
        lang_instruction = {
            "en": "Answer in English.",
            "bn": "Answer in Bengali (বাংলা).",
            "auto": "Answer in the same language as the question."
        }.get(language, "Answer in English.")

        user_prompt = f"""Context Documents:
{context_text}

Question: {query}

Instructions: {lang_instruction} Cite document IDs in [brackets] for all facts."""

        return f"{system_prompt}\n\n{user_prompt}"

    def _select_model(self, tier: str) -> str:
        """Select Groq model based on complexity tier"""
        models = {
            "simple": settings.groq_model_simple,
            "long": settings.groq_model_long,
            "complex": settings.groq_model_complex
        }
        return models.get(tier, settings.groq_model_simple)

    async def _call_groq(self, prompt: str, model: str) -> str:
        """Call Groq API"""
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.groq_api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.3,
            "max_tokens": 1024
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
            "contents": [{
                "parts": [{"text": prompt}]
            }],
            "generationConfig": {
                "temperature": 0.3,
                "maxOutputTokens": 1024
            }
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()
            return data["candidates"][0]["content"]["parts"][0]["text"]

    def _extract_citations(self, context_chunks: List[Dict[str, Any]]) -> List[Dict[str, str]]:
        """Extract citation information from context chunks"""
        citations = []
        seen_items = set()
        
        for chunk in context_chunks:
            item_id = chunk["item_id"]
            if item_id not in seen_items:
                citations.append({
                    "item_id": item_id,
                    "title": chunk["title"],
                    "item_type": chunk["item_type"]
                })
                seen_items.add(item_id)
        
        return citations

    def _fallback_response(self, context_chunks: List[Dict[str, Any]], language: str) -> str:
        """Generate fallback response when both LLMs fail"""
        if language == "bn":
            prefix = "দুঃখিত, AI সেবা সাময়িকভাবে অনুপলব্ধ। এখানে প্রাসঙ্গিক নথি রয়েছে:\n\n"
        else:
            prefix = "Sorry, AI service is temporarily unavailable. Here are relevant documents:\n\n"
        
        docs = "\n".join([
            f"• {chunk['title']} [{chunk['item_id']}]"
            for chunk in context_chunks[:5]
        ])
        
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
                "generationConfig": {"temperature": 0.1, "maxOutputTokens": 150}
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
