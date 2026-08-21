from __future__ import annotations

import sys
from pathlib import Path


HERE = Path(__file__).parent
MCQ_GENERATOR_DIR = HERE.parent / "mcq_generator"

if str(MCQ_GENERATOR_DIR) not in sys.path:
    sys.path.insert(0, str(MCQ_GENERATOR_DIR))

from mcq_gen.config import settings  # noqa: E402


HOST = "127.0.0.1"
PORT = 8768