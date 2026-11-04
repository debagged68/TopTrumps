// Shared notification wording for a challenge room and the challenge list.
export function challengeUpdateMessage(before, after) {
  if (!before || before.status === after.status) return null;
  const friend = after.opponentName || after.friendLabel || "Your friend";
  if (after.role === "sender") {
    if (before.status === "awaiting_reply" && after.status === "accepted")
      return `${friend} accepted your challenge.`;
    if (
      ["awaiting_reply", "accepted"].includes(before.status) &&
      after.status === "result_ready"
    )
      return `${friend} has played. Your result is ready.`;
    if (
      ["awaiting_reply", "accepted"].includes(before.status) &&
      after.status === "declined"
    )
      return `${friend} declined your challenge.`;
  }
  if (
    after.role === "recipient" &&
    before.status === "waiting_for_sender" &&
    after.status === "your_turn"
  )
    return `${friend} has dealt. It’s your turn.`;
  return null;
}
