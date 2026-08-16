/**
 * Hands a string to the browser as a file. Client side and dependency free:
 * the text is already built from the local cache, so there is nothing for a
 * server to do here and no reason to send a household's box list anywhere to
 * get it back again.
 *
 * The anchor is created, clicked, and removed rather than rendered, because
 * the file does not exist until the button is pressed. The object URL is
 * revoked on the next turn of the event loop, after the click has been
 * handled: revoking it in the same statement cancels the download in some
 * browsers.
 */
export function downloadText(filename: string, mimeType: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
