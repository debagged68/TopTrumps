import { Crown, ShieldX, Equal } from "lucide-react";
import SinBadge from "./SinBadge";
import type { CardOwner } from "./CardKey";
import type { CardData } from "./PlayingCard";

type Props = {
  yours: CardData;
  theirs: CardData;
  opponent: string;
  opponentOwner: Exclude<CardOwner, "you">;
  result: {
    category: string;
    yours: number;
    theirs: number;
    outcome: "win" | "loss" | "draw";
  };
};

// Both play modes use this single, viewer-relative result. Never recalculate the winner here.
export default function RoundResult({
  yours,
  theirs,
  opponent,
  opponentOwner,
  result,
}: Props) {
  const Icon =
    result.outcome === "win"
      ? Crown
      : result.outcome === "loss"
        ? ShieldX
        : Equal;
  const title =
    result.outcome === "win"
      ? "WIN"
      : result.outcome === "loss"
        ? "LOSE"
        : "DRAW";
  return (
    <section
      className={`round-result ${result.outcome}`}
      aria-label="Round result"
    >
      <div className="result-verdict" role="status">
        <Icon aria-hidden="true" />
        <h1>{title}</h1>
        <p>
          {result.outcome === "win"
            ? "You take this round."
            : result.outcome === "loss"
              ? `${opponent} takes this round.`
              : "Equal scores. Honours even."}
        </p>
      </div>
      <div
        className="result-scoreboard"
        aria-label={`${result.category}: you ${result.yours}, ${opponent} ${result.theirs}`}
      >
        <div className="result-sin">
          <SinBadge name={result.category} />
          <span>THE DECIDING SIN</span>
        </div>
        <div
          className={`result-score ${result.outcome === "win" ? "winner" : ""}`}
        >
          <span>You</span>
          <strong>{result.yours}</strong>
        </div>
        <span className="result-versus" aria-hidden="true">
          v
        </span>
        <div
          className={`result-score ${result.outcome === "loss" ? "winner" : ""}`}
        >
          <span>{opponent}</span>
          <strong>{result.theirs}</strong>
        </div>
      </div>
      <div className="result-quotes">
        {[
          {
            card: yours,
            name: "Your card",
            winner: result.outcome === "win",
            owner: "you",
          },
          {
            card: theirs,
            owner: opponentOwner,
            name: `${opponent}’s card`,
            winner: result.outcome === "loss",
          },
        ].map(({ card, name, winner, owner }) => (
          <article
            className={`result-quote ${winner ? "winner" : ""}`}
            data-card-owner={owner}
            key={name}
            style={{ flexGrow: card.front.length + 100 }}
          >
            <div className="result-quote-label">
              <strong>{name}</strong>
              {winner && (
                <span>
                  <Crown size={13} />
                  Winning card
                </span>
              )}
            </div>
            <blockquote tabIndex={0} aria-label={`${name}: complete quote`}>
              “{card.front}”<cite>{card.speaker || "Donald Trump"}</cite>
            </blockquote>
          </article>
        ))}
      </div>
    </section>
  );
}
