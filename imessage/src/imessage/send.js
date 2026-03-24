import { execFile } from "child_process";

/**
 * Send an iMessage to a phone number or email address.
 * Uses AppleScript via osascript under the hood.
 *
 * @param {string} to       - Phone number (e.g. "+14155551234") or Apple ID email
 * @param {string} message  - The message text to send
 * @param {string} [service="iMessage"] - Service type: "iMessage" or "SMS"
 * @returns {Promise<void>}
 */
export function sendMessage(to, message, service = "iMessage") {
  // Escape special characters for AppleScript string
  const escapedMessage = message.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const escapedTo = to.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  const script = `
    tell application "Messages"
      set targetService to 1st account whose service type = ${service}
      set targetBuddy to participant "${escapedTo}" of targetService
      send "${escapedMessage}" to targetBuddy
    end tell
  `;

  return new Promise((resolve, reject) => {
    execFile("osascript", ["-e", script], (error, stdout, stderr) => {
      if (error) {
        reject(
          new Error(
            `Failed to send message: ${error.message}${stderr ? `\n${stderr}` : ""}`
          )
        );
      } else {
        resolve();
      }
    });
  });
}

/**
 * Send a message to a group chat by chat name.
 * Requires the group chat to already exist in Messages.
 *
 * @param {string} chatName - The display name of the group chat
 * @param {string} message  - The message text to send
 * @returns {Promise<void>}
 */
export function sendToGroupChat(chatName, message) {
  const escapedMessage = message.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const escapedChat = chatName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  const script = `
    tell application "Messages"
      set targetChat to chat "${escapedChat}"
      send "${escapedMessage}" to targetChat
    end tell
  `;

  return new Promise((resolve, reject) => {
    execFile("osascript", ["-e", script], (error, stdout, stderr) => {
      if (error) {
        reject(
          new Error(
            `Failed to send to group: ${error.message}${stderr ? `\n${stderr}` : ""}`
          )
        );
      } else {
        resolve();
      }
    });
  });
}

/**
 * Send a file (image, document, etc.) to a phone number or email address.
 * Uses AppleScript POSIX file under the hood.
 *
 * @param {string} to       - Phone number or Apple ID email
 * @param {string} filePath - Absolute path to the file to send
 * @param {string} [service="iMessage"] - Service type: "iMessage" or "SMS"
 * @returns {Promise<void>}
 */
export function sendFile(to, filePath, service = "iMessage") {
  const escapedTo = to.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const escapedPath = filePath.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  const script = `
    tell application "Messages"
      set targetService to 1st account whose service type = ${service}
      set targetBuddy to participant "${escapedTo}" of targetService
      send POSIX file "${escapedPath}" to targetBuddy
    end tell
  `;

  return new Promise((resolve, reject) => {
    execFile("osascript", ["-e", script], (error, stdout, stderr) => {
      if (error) {
        reject(
          new Error(
            `Failed to send file: ${error.message}${stderr ? `\n${stderr}` : ""}`
          )
        );
      } else {
        resolve();
      }
    });
  });
}

/**
 * Send a file to a group chat by chat name.
 *
 * @param {string} chatName - The display name of the group chat
 * @param {string} filePath - Absolute path to the file to send
 * @returns {Promise<void>}
 */
export function sendFileToGroupChat(chatName, filePath) {
  const escapedChat = chatName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const escapedPath = filePath.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  const script = `
    tell application "Messages"
      set targetChat to chat "${escapedChat}"
      send POSIX file "${escapedPath}" to targetChat
    end tell
  `;

  return new Promise((resolve, reject) => {
    execFile("osascript", ["-e", script], (error, stdout, stderr) => {
      if (error) {
        reject(
          new Error(
            `Failed to send file to group: ${error.message}${stderr ? `\n${stderr}` : ""}`
          )
        );
      } else {
        resolve();
      }
    });
  });
}
