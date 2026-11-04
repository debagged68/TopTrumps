"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import PlayingCard, { CardData } from "./PlayingCard";
import type { CardOwner } from "./CardKey";
import SinBadge from "./SinBadge";

export function ReadingDialog({
  title,
  onClose,
  children,
  owner,
}: {
  title: string;
  owner?: CardOwner;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    const node = dialog.current;
    return () => node?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      data-card-owner={owner}
      className="reading-dialog"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-label={title}
    >
      <div className="reading-content">
        <button
          className="secondary dialog-close"
          onClick={onClose}
          aria-label="Close enlarged view"
        >
          <X />
        </button>
        <h2>{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
export function OpponentCard({
  card,
  name,
  owner,
}: {
  card: CardData;
  name: string;
  owner: "computer" | "friend";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="opponent-strip secondary"
        data-card-owner={owner}
        onClick={() => setOpen(true)}
      >
        <img src="/trump-art.png" alt="" />
        <span>
          <strong>{name}’s card</strong>
          <small>“{card.front}”</small>
        </span>
        <span>View</span>
      </button>
      {open && (
        <ReadingDialog
          owner={owner}
          title={`${name}’s card`}
          onClose={() => setOpen(false)}
        >
          <img className="reading-portrait" src="/trump-art.png" alt="" />
          <blockquote>“{card.front}”</blockquote>
          <p>{card.speaker || "Donald Trump"}</p>
          <p className="muted">The chosen sin is hidden until you play.</p>
        </ReadingDialog>
      )}
    </>
  );
}

type Props = {
  cards: CardData[];
  owners?: CardOwner[];
  categories: string[];
  onActive?: (card: CardData) => void;
  onPick?: (sin: string) => void;
  picked?: string;
  disabled?: boolean;
  tags?: string[];
  result?: { category: string; outcome: string };
  heading?: string;
  overlap?: boolean;
};
export default function CardHand({
  cards,
  owners,
  categories,
  onActive,
  onPick,
  picked,
  disabled,
  tags,
  result,
  heading,
  overlap = false,
}: Props) {
  const rail = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(overlap ? cards.length - 1 : 0);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const [flipped, setFlipped] = useState<Record<string, boolean>>(() =>
    result ? Object.fromEntries(cards.map((c) => [c.id, true])) : {},
  );
  const [enlarged, setEnlarged] = useState(false);
  const [compare, setCompare] = useState(false);
  const current = cards[index] || cards[0];
  const ids = cards.map((c) => c.id).join(":");
  useEffect(() => {
    setIndex(overlap ? cards.length - 1 : 0);
    rail.current?.scrollTo({ left: 0 });
  }, [ids, overlap]);
  function select(next: number) {
    setIndex(next);
    onActive?.(cards[next]);
    if (overlap) return;
    const child = rail.current?.children[next] as HTMLElement;
    rail.current?.scrollTo({
      left: child
        ? Math.max(
            0,
            child.offsetLeft -
              child.parentElement!.clientWidth / 2 +
              child.clientWidth / 2,
          )
        : 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  function onScroll() {
    if (overlap) return;
    const node = rail.current;
    if (!node) return;
    const children = Array.from(node.children) as HTMLElement[];
    let next = 0;
    children.forEach((c, i) => {
      if (
        Math.abs(
          Math.max(0, c.offsetLeft - node.clientWidth / 2 + c.clientWidth / 2) -
            node.scrollLeft,
        ) <
        Math.abs(
          Math.max(
            0,
            children[next].offsetLeft -
              node.clientWidth / 2 +
              children[next].clientWidth / 2,
          ) - node.scrollLeft,
        )
      )
        next = i;
    });
    if (next !== index) {
      setIndex(next);
      onActive?.(cards[next]);
    }
  }
  const turn = (id: string) => setFlipped((f) => ({ ...f, [id]: !f[id] }));
  return (
    <section
      className="hand-view"
      aria-label={result ? "Round cards" : "Your two-card hand"}
    >
      <div className="hand-toolbar">
        <span aria-live="polite">
          {tags?.[index] || `Card ${index + 1} of ${cards.length}`}
        </span>
        <div>
          {cards.length > 1 && (
            <button className="text-control" onClick={() => setCompare(true)}>
              Compare
            </button>
          )}
          <button
            className="text-control"
            onClick={() => setEnlarged(true)}
            aria-label="Enlarge card"
          >
            <Maximize2 size={16} />
            Enlarge
          </button>
        </div>
      </div>
      <div
        className={"hand-rail " + (overlap ? "overlap-rail" : "")}
        ref={rail}
        onScroll={onScroll}
        onPointerDown={(e) => {
          swiped.current = false;
          gesture.current = null;
          if (overlap && !(e.target as HTMLElement).closest("button,a")) {
            gesture.current = { x: e.clientX, y: e.clientY };
            swiped.current = false;
          }
        }}
        onPointerUp={(e) => {
          const start = gesture.current;
          gesture.current = null;
          if (!overlap || !start) return;
          const dx = e.clientX - start.x,
            dy = e.clientY - start.y;
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
            swiped.current = true;
            select(index === 0 ? 1 : 0);
          }
        }}
        onPointerCancel={() => {
          gesture.current = null;
        }}
        onClickCapture={(e) => {
          if (swiped.current) {
            swiped.current = false;
            if (e.detail > 0) {
              e.preventDefault();
              e.stopPropagation();
            }
          }
        }}
      >
        {cards.map((card, i) => (
          <div
            className={
              "hand-page " +
              (overlap ? (i === index ? "is-front" : "is-behind") : "")
            }
            key={card.id}
            inert={overlap && i !== index}
            aria-hidden={overlap && i !== index ? true : undefined}
          >
            <PlayingCard
              card={card}
              owner={owners?.[i] ?? "you"}
              tag={tags?.[i] || `YOUR CARD ${i + 1}`}
              categories={categories}
              flipped={!!flipped[card.id]}
              onFlip={() => turn(card.id)}
              heading={heading}
              disabled={disabled}
              onActivate={() => {
                if (index !== i) {
                  setIndex(i);
                  onActive?.(card);
                }
              }}
              onPick={
                onPick
                  ? (sin) => {
                      setIndex(i);
                      onActive?.(card);
                      onPick(sin);
                    }
                  : undefined
              }
              picked={i === index ? picked : undefined}
              deciding={
                result
                  ? {
                      sin: result.category,
                      draw: result.outcome === "draw",
                      winner:
                        i === 0
                          ? result.outcome === "win"
                          : result.outcome === "loss",
                    }
                  : undefined
              }
            />
          </div>
        ))}
        {overlap && (
          <button
            className="overlap-peek"
            onClick={() => select(index === 0 ? 1 : 0)}
            aria-label={`Bring ${tags?.[index === 0 ? 1 : 0] || "other card"} to the front`}
          />
        )}
      </div>
      <div className="hand-nav">
        <button
          className="text-control"
          disabled={!overlap && index === 0}
          onClick={() => select(overlap ? (index === 0 ? 1 : 0) : index - 1)}
          aria-label="Previous card"
        >
          <ChevronLeft />
        </button>
        <div>
          {cards.map((c, i) => (
            <button
              key={c.id}
              className={"hand-dot " + (index === i ? "selected" : "")}
              aria-label={`Show card ${i + 1}`}
              aria-pressed={index === i}
              onClick={() => select(i)}
            />
          ))}
        </div>
        <span>
          {overlap
            ? "Swipe to switch cards"
            : flipped[current.id]
              ? "Tap corner for quote"
              : "Tap card for sins"}
        </span>
        <button
          className="text-control"
          disabled={!overlap && index === cards.length - 1}
          onClick={() => select(overlap ? (index === 0 ? 1 : 0) : index + 1)}
          aria-label="Next card"
        >
          <ChevronRight />
        </button>
      </div>
      {enlarged && (
        <ReadingDialog
          owner={owners?.[index] ?? "you"}
          title={tags?.[index] || `Card ${index + 1}`}
          onClose={() => setEnlarged(false)}
        >
          <img className="reading-portrait" src="/trump-art.png" alt="" />
          <blockquote>“{current.front}”</blockquote>
          <p>{current.speaker || "Donald Trump"}</p>
          {current.scores && (
            <div className="reading-scores">
              {categories.map((sin) => (
                <div key={sin}>
                  <SinBadge name={sin} />
                  <strong>{current.scores![sin]}</strong>
                  {onPick && (
                    <button
                      onClick={() => {
                        onPick(sin);
                        setEnlarged(false);
                      }}
                    >
                      Choose
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </ReadingDialog>
      )}
      {compare && (
        <ReadingDialog title="Compare cards" onClose={() => setCompare(false)}>
          <p>Each score belongs to the same sin across both cards.</p>
          <table className="comparison">
            <thead>
              <tr>
                <th>Sin</th>
                {cards.map((c, i) => (
                  <th key={c.id}>
                    <button
                      onClick={() => {
                        select(i);
                        setCompare(false);
                      }}
                    >
                      {tags?.[i] || `Card ${i + 1}`}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((sin) => (
                <tr
                  key={sin}
                  className={result?.category === sin ? "deciding" : ""}
                >
                  <th>
                    <SinBadge name={sin} />
                  </th>
                  {cards.map((c) => (
                    <td key={c.id}>{c.scores?.[sin] ?? "Hidden"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </ReadingDialog>
      )}
    </section>
  );
}
