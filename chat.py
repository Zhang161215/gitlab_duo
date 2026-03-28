#!/usr/bin/env python3
"""
GitLab AI Proxy -> Anthropic Claude Streaming Chat Client

Usage:
    python chat.py [--model MODEL] [--max-tokens N]

Commands:
    /exit   - Quit the chat
    /clear  - Reset conversation context
"""

import argparse
import getpass
import json
import sys

import httpx


def read_gitlab_token() -> str:
    """Securely read GitLab PAT from user input."""
    token = getpass.getpass("GitLab PAT: ")
    if not token or not token.strip():
        raise ValueError("GitLab PAT is required")
    return token.strip()


def get_direct_access(token: str) -> dict:
    """Obtain direct-access credentials from GitLab AI gateway."""
    resp = httpx.post(
        "https://gitlab.com/api/v4/ai/third_party_agents/direct_access",
        headers={"Authorization": f"Bearer {token}"},
        json={},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def build_proxy_headers(direct_access: dict) -> dict[str, str]:
    """Build request headers for the Anthropic proxy endpoint."""
    headers = {
        "Authorization": f"Bearer {direct_access['token']}",
        "anthropic-version": "2023-06-01",
        "Accept": "text/event-stream",
    }
    # Merge any extra headers returned by direct_access
    for key, value in direct_access.get("headers", {}).items():
        headers[key] = str(value)
    return headers


def stream_chat(
    token: str,
    model: str,
    max_tokens: int,
    messages: list[dict],
) -> str:
    """
    Send a streaming chat request through the GitLab AI proxy
    and print tokens as they arrive. Returns the full assistant reply.
    """
    direct_access = get_direct_access(token)
    if not direct_access.get("token") or not direct_access.get("headers"):
        raise RuntimeError("direct_access response is missing token or headers")

    headers = build_proxy_headers(direct_access)
    body = {
        "model": model,
        "max_tokens": max_tokens,
        "stream": True,
        "messages": messages,
    }

    assistant_text_parts: list[str] = []

    with httpx.Client(timeout=None) as client:
        with client.stream(
            "POST",
            "https://cloud.gitlab.com/ai/v1/proxy/anthropic/v1/messages",
            headers=headers,
            json=body,
        ) as response:
            if response.status_code != 200:
                error_body = response.read().decode("utf-8", errors="replace")
                raise RuntimeError(
                    f"Proxy request failed: HTTP {response.status_code}\n{error_body}"
                )

            current_event = ""
            data_lines: list[str] = []

            for raw_line in response.iter_lines():
                line = raw_line  # httpx iter_lines already strips \n

                if line == "":
                    # Empty line = end of SSE block
                    if data_lines:
                        payload = "\n".join(data_lines)
                        if payload != "[DONE]":
                            try:
                                event_data = json.loads(payload)
                            except json.JSONDecodeError:
                                event_data = None

                            if current_event == "content_block_delta":
                                if (
                                    event_data
                                    and event_data.get("delta", {}).get("text")
                                ):
                                    text = event_data["delta"]["text"]
                                    print(text, end="", flush=True)
                                    assistant_text_parts.append(text)

                            elif current_event == "error":
                                if event_data:
                                    raise RuntimeError(
                                        f"SSE error: {json.dumps(event_data)}"
                                    )
                                raise RuntimeError(f"SSE error: {payload}")

                    current_event = ""
                    data_lines.clear()
                    continue

                if line.startswith("event:"):
                    current_event = line[6:].strip()
                    continue

                if line.startswith("data:"):
                    data_lines.append(line[5:].lstrip())

    return "".join(assistant_text_parts)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="GitLab AI Proxy Claude Streaming Chat"
    )
    parser.add_argument(
        "--model",
        default="claude-opus-4-6",
        help="Anthropic model to use (default: claude-opus-4-6)",
    )
    parser.add_argument(
        "--max-tokens",
        type=int,
        default=1024,
        help="Maximum tokens in the response (default: 1024)",
    )
    args = parser.parse_args()

    gitlab_token = read_gitlab_token()

    print(f"model: {args.model}")
    print("Token loaded.")
    print("Type a message and press Enter. Use /exit to quit, /clear to reset context.")
    print()

    messages: list[dict] = []

    while True:
        try:
            user_input = input("you: ")
        except (EOFError, KeyboardInterrupt):
            print()
            break

        if not user_input.strip():
            continue

        if user_input.strip() == "/exit":
            break

        if user_input.strip() == "/clear":
            messages.clear()
            print("Context cleared.")
            print()
            continue

        messages.append(
            {
                "role": "user",
                "content": [{"type": "text", "text": user_input}],
            }
        )

        print()
        print("assistant: ", end="", flush=True)

        try:
            assistant_reply = stream_chat(
                token=gitlab_token,
                model=args.model,
                max_tokens=args.max_tokens,
                messages=messages,
            )
            print()
            print()

            if assistant_reply.strip():
                messages.append(
                    {
                        "role": "assistant",
                        "content": [{"type": "text", "text": assistant_reply}],
                    }
                )
        except Exception as exc:
            print()
            print()
            print(f"\033[31mRequest failed: {exc}\033[0m")

            # Remove the failed user message
            if messages:
                messages.pop()

            print()


if __name__ == "__main__":
    main()
