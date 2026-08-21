from __future__ import annotations

import structlog

from config import settings
from mcq_gen.agents.corrector import _build_prompt
from mcq_gen.db.flagged import FlaggedQuestion
from mcq_gen.passage_db import get_passage_body
from mcq_gen.schemas import Draft, Spec
from reviewer_llm import chat_structured


log = structlog.get_logger(__name__)


def run_proactive_corrector(
    question: FlaggedQuestion,
    spec: Spec,
    iteration: int = 0,
) -> Draft:
    passage_text = get_passage_body(question.passage_id)
    prompt = _build_prompt(question, spec, passage_text)
    prompt = prompt.replace("用戶投訴", "主動審核意見").replace("投訴", "審核意見")

    log.info(
        "proactive_corrector_start",
        question_id=question.question_id,
        passage=question.passage_id,
        iteration=iteration,
    )
    draft = chat_structured(
        user_message=prompt,
        schema=Draft,
        temperature=0.5,
        model=settings.corrector_bot,
    )
    draft.mapped_spec = spec
    log.info(
        "proactive_corrector_done",
        question_id=question.question_id,
        iteration=iteration,
    )
    return draft