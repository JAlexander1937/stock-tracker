import os
import logging

logger = logging.getLogger(__name__)


def send_pushover(title: str, message: str) -> bool:
    user_key = os.getenv("PUSHOVER_USER_KEY")
    api_token = os.getenv("PUSHOVER_API_TOKEN")
    if not user_key or not api_token:
        logger.debug("Pushover credentials not configured, skipping.")
        return False
    try:
        import requests
        resp = requests.post(
            "https://api.pushover.net/1/messages.json",
            data={"token": api_token, "user": user_key, "title": title, "message": message},
            timeout=10,
        )
        resp.raise_for_status()
        logger.info("Pushover sent: %s", title)
        return True
    except Exception as e:
        logger.error("Pushover failed: %s", e)
        return False


def send_sms(message: str) -> bool:
    sid = os.getenv("TWILIO_ACCOUNT_SID")
    token = os.getenv("TWILIO_AUTH_TOKEN")
    from_num = os.getenv("TWILIO_FROM")
    to_num = os.getenv("TWILIO_TO")
    if not all([sid, token, from_num, to_num]):
        logger.debug("Twilio credentials not configured, skipping.")
        return False
    try:
        from twilio.rest import Client
        client = Client(sid, token)
        client.messages.create(body=message, from_=from_num, to=to_num)
        logger.info("SMS sent to %s", to_num)
        return True
    except Exception as e:
        logger.error("Twilio failed: %s", e)
        return False


def send_desktop(title: str, message: str) -> bool:
    try:
        from plyer import notification
        notification.notify(title=title, message=message, timeout=10)
        logger.info("Desktop notification sent: %s", title)
        return True
    except Exception as e:
        logger.error("Desktop notification failed: %s", e)
        return False


def send_all(title: str, message: str):
    send_pushover(title, message)
    send_sms(f"{title}: {message}")
    send_desktop(title, message)
