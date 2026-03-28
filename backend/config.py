import json
import os
import secrets
import uuid
from datetime import datetime, timezone
from pathlib import Path

from pydantic import BaseModel, Field, model_validator

DATA_DIR = Path(__file__).parent / "data"
CONFIG_FILE = DATA_DIR / "config.json"
ENV_FILE = Path(__file__).parent / ".env"


def _load_dotenv():
    """Load .env file into os.environ (simple parser, no dependency)."""
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip("\"'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_dotenv()


class KeyConfig(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    name: str
    pat: str
    enabled: bool = True
    order: int = 0
    weight: int = 1
    status: str = "active"  # "active" | "invalid"
    failure_count: int = 0
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ApiKeyEntry(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    name: str
    key: str = Field(default_factory=lambda: f"sk-gd-{secrets.token_hex(24)}")
    auto_continue: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class Settings(BaseModel):
    rotation_mode: str = "weighted_round_robin"  # "round_robin" | "weighted_round_robin" | "ordered_fallback"
    max_retries: int = 2
    blacklist_threshold: int = 5
    validation_interval: int = 5  # minutes
    max_continuations: int = 3  # auto-continue on stream truncation
    max_tokens_cap: int = 4096  # cap client max_tokens to prevent GitLab ~93s timeout
    test_model: str = "claude-sonnet-4-6"
    api_keys: list[ApiKeyEntry] = []
    admin_password: str = Field(default_factory=lambda: f"admin-{secrets.token_hex(16)}")
    gitlab_url: str = "https://gitlab.com"
    anthropic_proxy: str = "https://cloud.gitlab.com/ai/v1/proxy/anthropic"

    @model_validator(mode="before")
    @classmethod
    def _migrate(cls, data):
        if isinstance(data, dict) and "proxy_api_key" in data:
            old_key = data.pop("proxy_api_key")
            if "api_keys" not in data or not data["api_keys"]:
                data["api_keys"] = [{"name": "Default", "key": old_key}]
        return data


class AppConfig(BaseModel):
    keys: list[KeyConfig] = []
    settings: Settings = Field(default_factory=Settings)


class ConfigManager:
    def __init__(self):
        self.admin_password_source = "auto"
        self.config = self._load()

    def _load(self) -> AppConfig:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        if CONFIG_FILE.exists():
            cfg = AppConfig.model_validate_json(CONFIG_FILE.read_text(encoding="utf-8"))
        else:
            cfg = AppConfig()
        # .env ADMIN_PASSWORD overrides config
        env_pw = os.environ.get("ADMIN_PASSWORD")
        if env_pw:
            cfg.settings.admin_password = env_pw
            self.admin_password_source = ".env"
        self._save(cfg)
        return cfg

    def _save(self, cfg: AppConfig | None = None):
        if cfg is None:
            cfg = self.config
        CONFIG_FILE.write_text(cfg.model_dump_json(indent=2), encoding="utf-8")

    def add_key(self, name: str, pat: str) -> KeyConfig:
        order = max((k.order for k in self.config.keys), default=-1) + 1
        key = KeyConfig(name=name, pat=pat, order=order)
        self.config.keys.append(key)
        self._save()
        return key

    def remove_key(self, key_id: str) -> bool:
        before = len(self.config.keys)
        self.config.keys = [k for k in self.config.keys if k.id != key_id]
        if len(self.config.keys) < before:
            self._save()
            return True
        return False

    def update_key(self, key_id: str, **fields) -> KeyConfig | None:
        for k in self.config.keys:
            if k.id == key_id:
                for field, value in fields.items():
                    if hasattr(k, field):
                        setattr(k, field, value)
                self._save()
                return k
        return None

    def reorder_keys(self, key_ids: list[str]):
        id_map = {k.id: k for k in self.config.keys}
        reordered = []
        for i, kid in enumerate(key_ids):
            if kid in id_map:
                id_map[kid].order = i
                reordered.append(id_map.pop(kid))
        for k in id_map.values():
            k.order = len(reordered)
            reordered.append(k)
        self.config.keys = reordered
        self._save()

    def update_settings(self, **fields) -> Settings:
        for field, value in fields.items():
            if hasattr(self.config.settings, field):
                setattr(self.config.settings, field, value)
        self._save()
        return self.config.settings

    def add_api_key(self, name: str) -> ApiKeyEntry:
        entry = ApiKeyEntry(name=name)
        self.config.settings.api_keys.append(entry)
        self._save()
        return entry

    def remove_api_key(self, key_id: str) -> bool:
        before = len(self.config.settings.api_keys)
        self.config.settings.api_keys = [k for k in self.config.settings.api_keys if k.id != key_id]
        if len(self.config.settings.api_keys) < before:
            self._save()
            return True
        return False

    def find_api_key(self, key_value: str) -> ApiKeyEntry | None:
        return next((k for k in self.config.settings.api_keys if k.key == key_value), None)

    def update_api_key(self, key_id: str, **fields) -> ApiKeyEntry | None:
        for k in self.config.settings.api_keys:
            if k.id == key_id:
                for field, value in fields.items():
                    if hasattr(k, field):
                        setattr(k, field, value)
                self._save()
                return k
        return None
