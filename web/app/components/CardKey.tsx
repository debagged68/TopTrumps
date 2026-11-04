export type CardOwner = "you" | "computer" | "friend";

export default function CardKey() {
  return (
    <ul className="card-owner-key" aria-label="Card colour key">
      {(["you", "computer", "friend"] as const).map((owner) => (
        <li key={owner}>
          <span
            className="card-owner-swatch"
            data-card-owner={owner}
            aria-hidden="true"
          />
          {owner === "you"
            ? "You"
            : owner === "computer"
              ? "Computer"
              : "Friend"}
        </li>
      ))}
    </ul>
  );
}
