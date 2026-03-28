import asyncio
import logging
import time
from contextlib import suppress
from dataclasses import dataclass, field

import httpx

from config import ConfigManager, KeyConfig

logger = logging.getLogger("keys")

IGNORABLE_ERRORS = {
    "context canceled",
    "connection reset",
    "broken pipe",
    "closed network",
}


@dataclass
class TokenEntry:
    token: str
    headers: dict
    expires_at: float

    @property
    def valid(self) -> bool:
        return time.time() < self.expires_at - 60

    @property
    def ttl(self) -> int:
        return max(0, int(self.expires_at - time.time()))


@dataclass
class KeyStats:
    total_requests: int = 0
    success: int = 0
    failures: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    last_used: float = 0


def is_ignorable_error(err: Exception) -> bool:
    msg = str(err).lower()
    return any(s in msg for s in IGNORABLE_ERRORS)


class KeyManager:
    def __init__(self, config_mgr: ConfigManager):
        self.config_mgr = config_mgr
        self._tokens: dict[str, TokenEntry] = {}
        self._locks: dict[str, asyncio.Lock] = {}
        self._rr_index: int = 0
        self._wrr_state: dict[str, int] = {}  # key_id -> current_weight
        self._stats: dict[str, KeyStats] = {}
        self._cooldowns: dict[str, float] = {}  # key_id -> cooldown_until timestamp
        self._refresh_task: asyncio.Task | None = None
        self._validate_task: asyncio.Task | None = None

    QUOTA_COOLDOWN_S = 30 * 60  # 30 min cooldown for 402 quota exceeded

    @property
    def settings(self):
        return self.config_mgr.config.settings

    @property
    def active_keys(self) -> list[KeyConfig]:
        return sorted(
            [
                k
                for k in self.config_mgr.config.keys
                if k.enabled and k.status == "active"
            ],
            key=lambda k: k.order,
        )

    @property
    def active_keys(self) -> list[KeyConfig]:
        now = time.time()
        return sorted(
            [
                k
                for k in self.config_mgr.config.keys
                if k.enabled
                and k.status == "active"
                and self._cooldowns.get(k.id, 0) <= now
            ],
            key=lambda k: k.order,
        )

    def _get_lock(self, pat: str) -> asyncio.Lock:
        if pat not in self._locks:
            self._locks[pat] = asyncio.Lock()
        return self._locks[pat]

    # --- Token Management ---

    async def get_token(self, pat: str) -> TokenEntry:
        if pat in self._tokens and self._tokens[pat].valid:
            return self._tokens[pat]
        async with self._get_lock(pat):
            if pat in self._tokens and self._tokens[pat].valid:
                return self._tokens[pat]
            entry = await self._fetch_token(pat)
            self._tokens[pat] = entry
            return entry

    async def _fetch_token(self, pat: str) -> TokenEntry:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{self.settings.gitlab_url}/api/v4/ai/third_party_agents/direct_access",
                headers={"Authorization": f"Bearer {pat}"},
                json={},
            )
            if resp.status_code not in (200, 201):
                raise RuntimeError(
                    f"Token fetch failed: {resp.status_code} {resp.text}"
                )
            data = resp.json()
            token = data.get("token", "")
            headers = data.get("headers", {}) or {}
            if not token:
                raise RuntimeError(f"Empty token: {data}")
            expires_at = time.time() + 7200
            if "expires_at" in data:
                try:
                    ea = float(data["expires_at"])
                    if ea > time.time() and ea == ea and ea != float("inf"):
                        expires_at = ea
                except (TypeError, ValueError):
                    pass
            elif "expires_in" in data:
                try:
                    ei = float(data["expires_in"])
                    if ei > 0 and ei == ei and ei != float("inf"):
                        expires_at = time.time() + ei
                except (TypeError, ValueError):
                    pass
            return TokenEntry(token=token, headers=headers, expires_at=expires_at)

    def invalidate_token(self, pat: str):
        self._tokens.pop(pat, None)

    # --- Key Selection (3 strategies) ---

    def select_key(self, exclude_ids: set[str] | None = None) -> KeyConfig | None:
        keys = self.active_keys
        if exclude_ids:
            keys = [k for k in keys if k.id not in exclude_ids]
        if not keys:
            return None

        mode = self.settings.rotation_mode
        if mode == "weighted_round_robin":
            return self._select_weighted_rr(keys)
        elif mode == "ordered_fallback":
            return keys[0]
        else:  # round_robin
            self._rr_index = self._rr_index % len(keys)
            key = keys[self._rr_index]
            self._rr_index += 1
            return key

    def _select_weighted_rr(self, keys: list[KeyConfig]) -> KeyConfig:
        """Smooth Weighted Round-Robin (Nginx-style)"""
        total_weight = sum(k.weight for k in keys)
        best: KeyConfig | None = None
        best_cw = -1

        for k in keys:
            cw = self._wrr_state.get(k.id, 0) + k.weight
            self._wrr_state[k.id] = cw
            if cw > best_cw:
                best_cw = cw
                best = k

        if best:
            self._wrr_state[best.id] -= total_weight
        return best  # type: ignore

    # --- Failure & Recovery ---

    def record_success(self, key: KeyConfig):
        if key.id not in self._stats:
            self._stats[key.id] = KeyStats()
        self._stats[key.id].total_requests += 1
        self._stats[key.id].success += 1

        if key.failure_count > 0:
            key.failure_count = 0
            self.config_mgr._save()
            logger.info(f"Key '{key.name}' failure count reset after success")

    def record_usage(self, key: KeyConfig, input_tokens: int, output_tokens: int):
        if key.id not in self._stats:
            self._stats[key.id] = KeyStats()
        self._stats[key.id].input_tokens += input_tokens
        self._stats[key.id].output_tokens += output_tokens
        self._stats[key.id].last_used = time.time()

    def record_failure(self, key: KeyConfig, error: Exception | None = None):
        if error and is_ignorable_error(error):
            logger.debug(f"Ignorable error for '{key.name}': {error}")
            return

        if key.id not in self._stats:
            self._stats[key.id] = KeyStats()
        self._stats[key.id].total_requests += 1
        self._stats[key.id].failures += 1

        key.failure_count += 1
        threshold = self.settings.blacklist_threshold
        if threshold > 0 and key.failure_count >= threshold:
            key.status = "invalid"
            self.invalidate_token(key.pat)
            logger.warning(
                f"Key '{key.name}' blacklisted after {key.failure_count} failures"
            )
        self.config_mgr._save()

    def restore_key(self, key_id: str) -> KeyConfig | None:
        key = self.config_mgr.update_key(key_id, status="active", failure_count=0)
        if key:
            self._cooldowns.pop(key_id, None)
            logger.info(f"Key '{key.name}' restored")
        return key

    def set_cooldown(self, key: KeyConfig, seconds: float | None = None):
        """Temporarily exclude a key from selection (e.g. after 402 quota exhausted)."""
        duration = seconds if seconds is not None else self.QUOTA_COOLDOWN_S
        self._cooldowns[key.id] = time.time() + duration
        logger.info(f"Key '{key.name}' cooled down for {int(duration)}s")

    def get_cooldown_remaining(self, key: KeyConfig) -> int:
        until = self._cooldowns.get(key.id, 0)
        return max(0, int(until - time.time()))

    def cleanup_key(self, key_id: str, pat: str):
        self._stats.pop(key_id, None)
        self._tokens.pop(pat, None)
        self._locks.pop(pat, None)
        self._wrr_state.pop(key_id, None)

    # --- Stats ---

    def get_stats(self) -> dict:
        total = sum(s.total_requests for s in self._stats.values())
        success = sum(s.success for s in self._stats.values())
        active = len(self.active_keys)
        total_input = sum(s.input_tokens for s in self._stats.values())
        total_output = sum(s.output_tokens for s in self._stats.values())
        return {
            "total_requests": total,
            "active_keys": active,
            "success_rate": round(success / total * 100, 1) if total > 0 else 100.0,
            "total_input_tokens": total_input,
            "total_output_tokens": total_output,
            "per_key": {
                kid: {
                    "total": s.total_requests,
                    "success": s.success,
                    "failures": s.failures,
                    "input_tokens": s.input_tokens,
                    "output_tokens": s.output_tokens,
                    "last_used": s.last_used,
                }
                for kid, s in self._stats.items()
            },
        }

    def get_key_status(self, key: KeyConfig) -> dict:
        token = self._tokens.get(key.pat)
        cooldown_remaining = self.get_cooldown_remaining(key)
        return {
            "has_token": token is not None and token.valid if token else False,
            "token_ttl": token.ttl if token else 0,
            "cooldown_remaining": cooldown_remaining,
        }

    async def validate_key(
        self, key: KeyConfig, model: str = "claude-sonnet-4-6"
    ) -> tuple[bool, str, int]:
        """Full validation: token refresh + minimal model request. Returns (valid, message, token_ttl)."""
        try:
            self.invalidate_token(key.pat)
            entry = await self.get_token(key.pat)
        except Exception as e:
            return False, f"Token 获取失败: {e}", 0

        target = f"{self.settings.anthropic_proxy}/v1/messages"
        headers = {
            "content-type": "application/json",
            "authorization": f"Bearer {entry.token}",
            "anthropic-version": "2023-06-01",
            **entry.headers,
        }
        test_body = {
            "model": model,
            "max_tokens": 1,
            "messages": [{"role": "user", "content": "hi"}],
        }
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(target, json=test_body, headers=headers)
            if 200 <= resp.status_code < 300:
                return True, "Token 有效，模型可用", entry.ttl
            detail = ""
            try:
                detail = resp.json().get("error", {}).get("message", resp.text[:200])
            except Exception:
                detail = resp.text[:200]
            return False, f"模型请求失败 ({resp.status_code}): {detail}", entry.ttl
        except Exception as e:
            return False, f"Token 有效但模型请求异常: {e}", entry.ttl

    # --- Background Tasks ---

    async def refresh_all_tokens(self):
        tasks = [self._safe_refresh(k) for k in self.active_keys]
        await asyncio.gather(*tasks)

    async def _safe_refresh(self, key: KeyConfig):
        try:
            await self.get_token(key.pat)
            logger.info(f"Token refreshed: '{key.name}'")
        except Exception as e:
            logger.warning(f"Token refresh failed: '{key.name}': {e}")

    async def start_refresh_loop(self):
        if self._refresh_task and not self._refresh_task.done():
            return
        self._refresh_task = asyncio.create_task(self._refresh_loop())

    async def _refresh_loop(self):
        while True:
            await asyncio.sleep(60)
            for key in self.active_keys:
                token = self._tokens.get(key.pat)
                if token and token.ttl < 1800:
                    await self._safe_refresh(key)

    async def start_validation_loop(self):
        if self._validate_task and not self._validate_task.done():
            return
        self._validate_task = asyncio.create_task(self._validation_loop())

    async def _validation_loop(self):
        """Periodically validate invalid keys with full model test (like gpt-load CronChecker)."""
        while True:
            interval = max(self.settings.validation_interval, 1) * 60
            await asyncio.sleep(interval)
            invalid_keys = [
                k
                for k in self.config_mgr.config.keys
                if k.enabled and k.status == "invalid"
            ]
            if not invalid_keys:
                continue
            logger.info(f"Validating {len(invalid_keys)} invalid key(s)...")
            for key in invalid_keys:
                valid, msg, _ = await self.validate_key(
                    key, model=self.settings.test_model
                )
                if valid:
                    key.status = "active"
                    key.failure_count = 0
                    self.config_mgr._save()
                    logger.info(f"Key '{key.name}' auto-recovered: {msg}")
                else:
                    logger.debug(f"Key '{key.name}' still invalid: {msg}")

    async def stop(self):
        for task in (self._refresh_task, self._validate_task):
            if task:
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task
        self._refresh_task = None
        self._validate_task = None
