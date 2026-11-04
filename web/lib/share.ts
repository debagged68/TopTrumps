// User-confirmed sharing only: the native share sheet where available, otherwise copy.
// Nothing here sends a message on the user's behalf.
export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

// The quote is already on the shared image/preview; keep its caption short.
export function inviteText(url: string) {
  return `Click to play\n${url}`;
}

// A nudge goes to someone who is already in the game, so the plain challenge page is enough.
export function nudgeText(
  kind: "your_turn" | "played",
  from: string,
  url: string,
) {
  return kind === "your_turn"
    ? `👑 ${from} here: it's your turn on our Top Trumps challenge.\n${url}`
    : `👑 ${from} here: I've played my card on our Top Trumps challenge. Come and see who won:\n${url}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function shareText(text: string): Promise<ShareOutcome> {
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function"
  ) {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return "cancelled";
      // fall through to copy when the share sheet is unavailable
    }
  }
  return (await copyText(text)) ? "copied" : "failed";
}

export function whatsappUrl(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

// Opens WhatsApp with the message already written. The user still chooses the
// contact and taps send: web pages cannot post to WhatsApp on someone's behalf.
export function openWhatsApp(text: string): boolean {
  const url = whatsappUrl(text);
  const win = window.open(url, "_blank", "noopener");
  if (win) return true;
  window.location.assign(url); // popup blocked after an async step: navigate instead
  return true;
}

// Render only the public quote front; no scores, selected sin or private credentials.
export async function prepareCardImage(card: {
  front: string;
  speaker?: string;
}): Promise<File> {
  const canvas = document.createElement("canvas"),
    ctx = canvas.getContext("2d");
  if (!ctx) throw Error("Image sharing unavailable");
  const width = 800,
    padding = 58,
    lineHeight = 44;
  canvas.width = width;
  ctx.font = "32px Georgia";
  const lines: string[] = [];
  let line = "";
  for (const word of `“${card.front}”`.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > width - padding * 2 && line) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  canvas.height = 620 + lines.length * lineHeight;
  ctx.fillStyle = "#fff5df";
  ctx.fillRect(0, 0, width, canvas.height);
  ctx.strokeStyle = "#cca453";
  ctx.lineWidth = 12;
  ctx.strokeRect(6, 6, width - 12, canvas.height - 12);
  ctx.fillStyle = "#192b33";
  ctx.font = "bold 28px Arial";
  ctx.fillText("TOP TRUMPS · YOUR MOVE", padding, 62);
  const portrait = new Image();
  portrait.src = "/trump-art.png";
  await portrait.decode();
  ctx.fillStyle = "#132a34";
  ctx.fillRect(padding, 90, width - padding * 2, 400);
  const scale = Math.min(
    (width - padding * 2) / portrait.width,
    400 / portrait.height,
  );
  ctx.drawImage(
    portrait,
    (width - portrait.width * scale) / 2,
    90 + (400 - portrait.height * scale) / 2,
    portrait.width * scale,
    portrait.height * scale,
  );
  ctx.fillStyle = "#192b33";
  ctx.font = "32px Georgia";
  lines.forEach((text, i) => ctx.fillText(text, padding, 548 + i * lineHeight));
  ctx.font = "22px Arial";
  ctx.fillText(
    card.speaker || "Donald Trump",
    padding,
    570 + lines.length * lineHeight,
  );
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(Error("Image unavailable"))),
      "image/png",
    ),
  );
  return new File([blob], "toptrumps-challenge.png", { type: "image/png" });
}
export async function shareCard(
  text: string,
  file: File | null,
): Promise<ShareOutcome> {
  if (file && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelled";
    }
  }
  return shareText(text);
}
