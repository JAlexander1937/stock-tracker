import os
import json
import logging
import webbrowser
from anthropic import Anthropic
from .alerts import send_all

logger = logging.getLogger(__name__)

client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY", ""))

SYSTEM_PROMPT = """You are a stock monitoring agent for a personal shopping tracker.
You are given information about a watched product and a new stock/price snapshot.
Decide what action to take from exactly one of these options:

- ALERT: The user should be notified right now (item came back in stock, or price dropped to/below their target).
- OPEN_URL: Open the product page in the browser so the user can act immediately (use this alongside ALERT for high-priority items).
- LOG: Nothing actionable — just record the snapshot and continue watching.

Respond with a JSON object:
{
  "action": "ALERT" | "OPEN_URL" | "LOG",
  "reason": "<short explanation>",
  "message": "<notification message to send to user, only if action is ALERT or OPEN_URL>"
}

Be conservative with ALERT — only trigger it when the situation is genuinely actionable for the user."""


def run_agent(product: dict, snapshot: dict) -> dict:
    """
    product: row from products table as dict
    snapshot: latest scrape result dict
    Returns: {"action": str, "reason": str, "message": str}
    """
    if not os.getenv("ANTHROPIC_API_KEY"):
        logger.warning("ANTHROPIC_API_KEY not set — defaulting to LOG action.")
        return {"action": "LOG", "reason": "No API key configured", "message": ""}

    user_content = json.dumps({
        "product": {
            "name": product.get("name") or snapshot.get("name"),
            "url": product["url"],
            "retailer": product["retailer"],
            "max_price": product.get("max_price"),
            "desired_qty": product.get("desired_qty", 1),
        },
        "snapshot": {
            "price": snapshot.get("price"),
            "in_stock": snapshot.get("in_stock"),
            "quantity": snapshot.get("quantity"),
        },
    }, indent=2)

    try:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=256,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_content}],
        )
        text = response.content[0].text.strip()
        # Strip markdown code fences if present
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        result = json.loads(text)
        action = result.get("action", "LOG").upper()
        reason = result.get("reason", "")
        message = result.get("message", "")

        product_name = product.get("name") or snapshot.get("name") or product["url"]

        if action in ("ALERT", "OPEN_URL"):
            send_all(f"Stock Alert: {product_name}", message or reason)

        if action == "OPEN_URL":
            try:
                webbrowser.open(product["url"])
            except Exception as e:
                logger.error("Failed to open URL: %s", e)

        return {"action": action, "reason": reason, "message": message}

    except Exception as e:
        logger.error("Agent error: %s", e)
        return {"action": "LOG", "reason": f"Agent error: {e}", "message": ""}
