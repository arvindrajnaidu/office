/**
 * Universal message types — channels normalize into these.
 */
export const MessageTypes = {
  SELF_CHAT: "self_chat",
  GROUP: "group",
  DM: "dm",
};

/**
 * Actions a backend can return (inbound response) or push (outbound request).
 */
export const ActionTypes = {
  REPLY_TEXT: "reply_text",
  SEND_MESSAGE: "send_message",
  SEND_IMAGE: "send_image",
  SEND_DOCUMENT: "send_document",
  REACT: "react",
};
