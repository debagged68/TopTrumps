"use client";
import { Check, Crown, RotateCcw } from "lucide-react";
import type { CardOwner } from "./CardKey";
import SinBadge from "./SinBadge";

export type CardData = {
  id: string;
  label: string;
  front: string;
  speaker?: string;
  scores?: Record<string, number>;
  links?: string[][];
};

type Props = {
  card: CardData;
  owner?: CardOwner;
  tag: string; // "YOUR CARD", "ANN'S CARD" …
  categories: string[];
  flipped: boolean;
  onFlip: () => void;
  heading?: string;
  subheading?: string;
  onPick?: (sin: string) => void; // makes rows buttons (sender choosing a sin)
  picked?: string; // sin selected by the sender
  deciding?: { sin: string; winner: boolean; draw: boolean };
  disabled?: boolean;
  revealLabel?: string; // quote-front-only card: tapping asks the server to reveal
  active?: boolean; // brought to the front of a stacked/spread pair
  onActivate?: () => void;
};

// The same markup and classes as the computer game's card, so the existing flip,
// fold-corner and sin-row styling applies unchanged.
export default function PlayingCard({
  card,
  tag,
  categories,
  flipped,
  onFlip,
  heading,
  subheading,
  onPick,
  picked,
  deciding,
  disabled,
  revealLabel,
  active = true,
  onActivate,
  owner = "you",
}: Props) {
  const hasScores = !!card.scores;
  const tappable = hasScores || !!revealLabel;
  const showBack = hasScores && flipped;
  const corner = (isBack: boolean) =>
    hasScores && (
      <button
        className="fold-corner"
        aria-label={isBack ? "Turn card to quote" : "Turn card to sins"}
        onClick={onFlip}
        disabled={disabled}
      >
        <RotateCcw size={15} />
      </button>
    );
  return (
    <div
      data-card-owner={owner}
      className={"card-slot " + (active ? "is-active" : "")}
    >
      <div
        className="flip-shell"
        role="group"
        tabIndex={0}
        aria-label={
          revealLabel
            ? `${tag}. ${revealLabel}`
            : `${tag}. ${showBack ? "Scores" : "Quote"} side.${hasScores ? " Press Enter or tap to turn over." : ""}`
        }
        aria-disabled={disabled || undefined}
        onFocus={onActivate}
        onClick={(event) => {
          onActivate?.();
          if (
            tappable &&
            !disabled &&
            !(event.target as HTMLElement).closest("button,a") &&
            !window.getSelection()?.toString()
          )
            onFlip();
        }}
        onKeyDown={(event) => {
          if (
            tappable &&
            !disabled &&
            event.target === event.currentTarget &&
            (event.key === "Enter" || event.key === " ")
          ) {
            event.preventDefault();
            onFlip();
          }
        }}
      >
        <div className={"flip-inner " + (showBack ? "is-flipped" : "")}>
          <article
            className="playing-card quote-front"
            aria-hidden={showBack}
            inert={showBack}
          >
            <div className="card-top">
              <span>{tag}</span>
              <Crown size={17} />
              <span>{card.label.replace("Donald ", "")}</span>
            </div>
            <div className="portrait">
              <img
                src="/trump-art.png"
                alt="Satirical portrait of Donald Trump with a floating crown"
                draggable={false}
              />
            </div>
            <blockquote
              className="quote"
              tabIndex={showBack ? -1 : 0}
              aria-label="Complete quote"
            >
              <p>“{card.front}”</p>
              <cite>{card.speaker || "Donald Trump"}</cite>
            </blockquote>
            {corner(false)}
          </article>
          {hasScores && (
            <article
              className="playing-card score-back"
              aria-hidden={!showBack}
              inert={!showBack}
            >
              <div className="card-top">
                <span>{tag}</span>
                <Crown size={17} />
                <span>{card.label.replace("Donald ", "")}</span>
              </div>
              <div className="back-heading">
                <h2>{heading ?? "Sins & scores"}</h2>
                {subheading && <p>{subheading}</p>}
              </div>
              <div className="sin-rows">
                {categories.map((sin) => {
                  const isDeciding = deciding?.sin === sin;
                  const won = isDeciding && deciding!.winner;
                  const body = (
                    <>
                      <span className="sin-description">
                        <SinBadge name={sin} />
                        {isDeciding && (
                          <small>
                            {won && <Check size={12} />}
                            {won
                              ? "Winner"
                              : deciding!.draw
                                ? "Draw"
                                : "Played sin"}
                          </small>
                        )}
                        {picked === sin && !isDeciding && (
                          <small>
                            <Check size={12} />
                            Chosen
                          </small>
                        )}
                      </span>
                      <strong>{card.scores?.[sin] ?? "—"}</strong>
                      {won && <Check size={18} />}
                    </>
                  );
                  return onPick ? (
                    <button
                      className={
                        "sin-score " +
                        (picked === sin ? "deciding winning" : "")
                      }
                      key={sin}
                      disabled={disabled}
                      aria-pressed={picked === sin}
                      onClick={() => onPick(sin)}
                      aria-label={`Choose ${sin}, score ${card.scores?.[sin]}`}
                    >
                      {body}
                    </button>
                  ) : (
                    <div
                      className={
                        "sin-score " +
                        (isDeciding ? "deciding " : "") +
                        (won ? "winning" : "")
                      }
                      key={sin}
                    >
                      {body}
                    </div>
                  );
                })}
              </div>
              {card.links?.[0] && (
                <a
                  className="source-link"
                  href={card.links[0][1]}
                  target="_blank"
                  rel="noreferrer"
                >
                  Quote source ↗
                </a>
              )}
              {corner(true)}
            </article>
          )}
        </div>
      </div>
    </div>
  );
}
