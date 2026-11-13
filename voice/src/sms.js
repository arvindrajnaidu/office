import twilio from "twilio";

export function createSmsHandler({ authToken, webhookUrl, dispatcher }) {
  return async function handleSms(req, res, params) {
    const signature = req.headers["x-twilio-signature"];
    const requestUrl = new URL(req.url, webhookUrl).href;
    if (typeof signature !== "string" || !twilio.validateRequest(authToken, signature, requestUrl, params)) {
      res.writeHead(403).end();
      return;
    }

    const response = new twilio.twiml.MessagingResponse();
    const { From, Body, MessageSid } = params;
    if (From && Body?.trim()) {
      try {
        const result = await dispatcher.dispatch({
          type: "dm",
          jid: From,
          senderName: From,
          text: Body.trim(),
          meta: { channel: "sms", messageSid: MessageSid },
        });
        if (result.text?.trim()) response.message(result.text.trim().slice(0, 1500));
      } catch {
        response.message("I couldn't answer that right now. Please try again.");
      }
    }

    res.writeHead(200, { "Content-Type": "text/xml" }).end(response.toString());
  };
}
