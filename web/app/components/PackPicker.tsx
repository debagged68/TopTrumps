"use client";
import { Lock } from "lucide-react";
import { PACKS } from "../../lib/packs";
export const DEFAULT_PACKS = ["donald", "donald"];
export default function PackPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (packs: string[]) => void;
}) {
  return (
    <section
      className="pack-picker"
      aria-label="Choose packs for your two cards"
    >
      <div className="pack-heading">
        <h2>Choose your packs</h2>
        <p>One random card per slot. Use the same pack twice.</p>
      </div>
      <div className="pack-grid">
        {PACKS.map((p) => {
          const slots = value
            .map((id, index) => (id === p.id ? index + 1 : 0))
            .filter(Boolean);
          return (
            <div
              className={"pack-tile " + (!p.owned ? "locked" : "owned")}
              key={p.id}
            >
              <div className={"pack-cover pack-cover-" + p.id}>
                <img src={p.art} alt="" loading="lazy" decoding="async" />
                <span>{p.short}</span>
                {!p.owned && <Lock className="pack-lock" size={20} />}
              </div>
              <strong>{p.name}</strong>
              {p.owned ? (
                <>
                  <small>
                    {slots.length
                      ? `Card ${slots.join(" + ")} · Selected`
                      : "Available"}
                  </small>
                  <div className="pack-slots">
                    {[0, 1].map((slot) => (
                      <button
                        type="button"
                        key={slot}
                        aria-pressed={value[slot] === p.id}
                        onClick={() =>
                          onChange(
                            value.map((id, index) =>
                              index === slot ? p.id : id,
                            ),
                          )
                        }
                      >
                        Card {slot + 1}
                        {value[slot] === p.id ? " ✓" : ""}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <small>
                  <Lock size={12} />{" "}
                  {p.available ? "Unlock pack" : "Coming soon"}
                </small>
              )}
            </div>
          );
        })}
      </div>
      {PACKS.filter((p) => p.owned).length === 1 && (
        <p className="pack-note">
          Playing the Donald Deck · Two different random cards.
        </p>
      )}
    </section>
  );
}
