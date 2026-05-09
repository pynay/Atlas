import os

os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")
os.environ.setdefault("TWELVELABS_API_KEY", "test-key")
os.environ.setdefault("TWELVELABS_INDEX_ID", "idx_test")
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
