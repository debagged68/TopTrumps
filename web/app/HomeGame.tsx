"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Crown, RotateCcw, Send, X } from "lucide-react";
import { emptyTally, parseTally, recordResult } from "../lib/tally.mjs";
import RoundResult from "./components/RoundResult";
import RoundCelebration from "./components/RoundCelebration";
import CardHand, { OpponentCard, ReadingDialog } from "./components/CardHand";
import PackPicker, { DEFAULT_PACKS } from "./components/PackPicker";
const TALLY_KEY = "toptrumps-tally-v1";
export default function HomeGame({
  challenges = false,
}: {
  challenges?: boolean;
}) {
  const [game, setGame] = useState<any>(null),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [packs, setPacks] = useState(DEFAULT_PACKS),
    [mode, setMode] = useState("first"),
    [selected, setSelected] = useState<any>(null),
    [picked, setPicked] = useState(""),
    [help, setHelp] = useState(false);
  const [tally, setTally] = useState(emptyTally),
    [celebration, setCelebration] = useState<"win" | "loss" | "draw" | null>(
      null,
    );
  const pending = useRef(false);
  useEffect(() => {
    try {
      setTally(parseTally(localStorage.getItem(TALLY_KEY)));
    } catch {}
    fetch("/api/game")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setGame(d);
        setSelected(d?.cards?.[0] ?? null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (!celebration) return;
    const timer = setTimeout(() => setCelebration(null), 2200);
    return () => clearTimeout(timer);
  }, [celebration]);
  useEffect(() => {
    if (!game?.done) return;
    let before = emptyTally();
    try {
      before = parseTally(localStorage.getItem(TALLY_KEY));
    } catch {}
    const next = recordResult(before, game.roundId, game.result.outcome);
    setTally(next);
    try {
      localStorage.setItem(TALLY_KEY, JSON.stringify(next));
    } catch {}
    if (next !== before)
      setCelebration(
        game.result.outcome === "You win"
          ? "win"
          : game.result.outcome === "Draw"
            ? "draw"
            : "loss",
      );
  }, [game?.done, game?.roundId]);
  async function act(input: any) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setGame(d);
      setSelected(d?.cards?.[0] ?? null);
      setPicked("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const current = selected || game?.cards?.[0];
  const result = game?.done
    ? {
        ...game.result,
        outcome:
          game.result.outcome === "You win"
            ? "win"
            : game.result.outcome === "Draw"
              ? "draw"
              : "loss",
      }
    : undefined;
  return (
    <main
      className={
        game
          ? `game-screen two-card-game ${game.done ? "round-result-mode" : ""}`
          : "home-screen new-home"
      }
    >
      <header>
        <div className="brand-group">
          <Link className="brand" href="/">
            <Crown />
            <span>TOP TRUMPS</span>
          </Link>
          <div className="tally" aria-label="Computer game tally">
            <span>
              <strong>{tally.wins}</strong>
              <small>You</small>
            </span>
            <span>
              <strong>{tally.losses}</strong>
              <small>Computer</small>
            </span>
            <span>
              <strong>{tally.draws}</strong>
              <small>Draws</small>
            </span>
          </div>
        </div>
        <button
          className="help-button"
          onClick={() => setHelp(true)}
          aria-label="How to play"
        >
          ?
        </button>
      </header>
      {!game ? (
        <>
          <div className="home-intro">
            <p className="eyebrow">TWO CARDS. SIX SINS. YOUR MOVE.</p>
            <h1>
              Pick your words.
              <br />
              Hide your sin.
            </h1>
            <p>Draw two cards. Choose your strongest challenge.</p>
          </div>
          <div className="opponent-options" aria-label="Choose opponent">
            <button aria-pressed={true} type="button">
              Play computer
            </button>
            {challenges && (
              <Link className="button-link secondary" href="/challenges/new">
                <Send size={18} />
                Challenge a friend
              </Link>
            )}
          </div>
          <PackPicker value={packs} onChange={setPacks} />
          <section className="home-deal">
            <div className="deal-toggle">
              <button
                className={mode === "first" ? "" : "secondary"}
                aria-pressed={mode === "first"}
                onClick={() => setMode("first")}
              >
                Take the deal<small>You choose the sin</small>
              </button>
              <button
                className={mode === "second" ? "" : "secondary"}
                aria-pressed={mode === "second"}
                onClick={() => setMode("second")}
              >
                Let computer deal<small>Guess its hidden sin</small>
              </button>
            </div>
            <button
              className="deal-hand"
              disabled={busy || !ready}
              onClick={() => act({ action: "deal", mode, packs })}
            >
              Deal my two cards
              <ArrowRight size={18} />
            </button>
            {challenges && (
              <Link className="text-link" href="/challenges">
                My challenges
              </Link>
            )}
          </section>
        </>
      ) : (
        <>
          {!game.done && (
            <div className="turn-banner" aria-live="polite">
              {game.done ? (
                <>
                  <strong>{game.result.outcome}</strong>
                  <span>
                    {game.result.category}: {game.result.yours}–
                    {game.result.theirs}
                  </span>
                </>
              ) : game.committed ? (
                <>
                  <strong>The cards are locked.</strong>
                  <span>Reveal the sin and see who wins.</span>
                </>
              ) : (
                <>
                  <strong>
                    {game.mode === "first"
                      ? "You have the deal"
                      : "Computer has the deal"}
                  </strong>
                  <span>
                    {game.mode === "first"
                      ? "Choose one card and a sin."
                      : "Read its quote. Which sin has it chosen?"}
                  </span>
                </>
              )}
            </div>
          )}
          {game.mode === "second" && !game.committed && game.opponentFront && (
            <OpponentCard card={game.opponentFront} name="Computer" />
          )}
          {game.done ? (
            <RoundResult
              yours={game.played}
              theirs={game.opponent}
              opponent="Computer"
              result={result!}
            />
          ) : (
            <CardHand
              key={game.roundId + ":" + game.committed + ":" + game.done}
              cards={
                game.committed
                  ? [game.played, game.opponent || game.opponentFront]
                  : game.cards
              }
              categories={game.categories}
              disabled={busy}
              onActive={(c) => {
                setSelected(c);
                setPicked("");
              }}
              onPick={
                !game.committed && game.mode === "first" ? setPicked : undefined
              }
              picked={picked}
              heading={
                !game.committed && game.mode === "first"
                  ? "Choose your sin"
                  : "Sins & scores"
              }
              result={result}
              tags={game.committed ? ["Your card", "Computer"] : undefined}
            />
          )}
          <div className="bottom-actions primary-actions">
            {game.done ? (
              <>
                <button
                  onClick={() => act({ action: "deal", mode: "first", packs })}
                  disabled={busy}
                >
                  <RotateCcw size={18} />
                  Take the deal
                </button>
                <button
                  className="secondary"
                  onClick={() => act({ action: "deal", mode: "second", packs })}
                  disabled={busy}
                >
                  Computer deals
                </button>
              </>
            ) : game.committed ? (
              <button onClick={() => act({ action: "reveal" })} disabled={busy}>
                Reveal result
                <ArrowRight size={18} />
              </button>
            ) : (
              <button
                disabled={busy || (game.mode === "first" && !picked)}
                onClick={() =>
                  act({ action: "play", card: current.id, category: picked })
                }
              >
                {game.mode === "first"
                  ? picked
                    ? `Play ${picked} · ${current.scores[picked]}`
                    : "Flip a card and choose a sin"
                  : "Play this card"}
                <ArrowRight size={18} />
              </button>
            )}
            <button
              className="secondary compact-cancel"
              disabled={busy}
              onClick={() => act({ action: "cancel" })}
              aria-label="Return home"
            >
              <X size={18} />
            </button>
          </div>
        </>
      )}
      {(busy || error) && (
        <div
          className={"notice " + (error ? "error" : "")}
          role={error ? "alert" : "status"}
        >
          {error || "Dealing…"}
        </div>
      )}
      {celebration && <RoundCelebration outcome={celebration} />}
      {help && (
        <ReadingDialog title="How to play" onClose={() => setHelp(false)}>
          <p>
            Choose two pack slots. Each gives you a random card; the same pack
            can fill both slots.
          </p>
          <p>
            Swipe between cards, tap to flip and inspect the six sins. Enlarge
            for reading or Compare to see scores together.
          </p>
          <p>
            The dealer chooses one card and a hidden sin. The responder sees the
            dealer’s quote, draws two cards and chooses one. Higher score on the
            dealer’s sin wins; equal scores draw.
          </p>
          <p>
            Against friends, the first player to take the next deal chooses the
            next sin. You can respond later.
          </p>
        </ReadingDialog>
      )}
    </main>
  );
}
