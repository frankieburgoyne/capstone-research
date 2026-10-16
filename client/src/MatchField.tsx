// Where each lineup slot stands on the field, as percentages (x across, y down).
// Defense across the middle, offense nearer the endzone, kicker on the sideline.
export const FIELD_POS: Record<string, [number, number]> = {
  DL: [28, 20],
  LB: [50, 20],
  DB: [72, 20],
  WR1: [14, 56],
  TE: [74, 66],
  WR2: [86, 56],
  QB: [50, 62],
  RB: [50, 84],
  K: [88, 86],
};

export type FieldSide = { name: string; team: string; season: number; score: number };
export type FieldSlot = { slot: string; you: FieldSide; cpu: FieldSide };

// Your players stand in the lower half, the computer's mirror them in the upper half
function yourY(y: number): number {
  return 54 + ((y - 20) / 66) * 40;
}

function surname(full: string): string {
  const parts = full.split(" ");
  return parts.length > 1 ? parts.slice(1).join(" ") : full;
}

export default function MatchField({
  slots,
  yourLabel,
  cpuLabel,
}: {
  slots: FieldSlot[];
  yourLabel: string;
  cpuLabel: string;
}) {
  return (
    <section className="matchfield" aria-label="The matchup on the field">
      <div className="mf-field">
        <div className="mf-end top">{cpuLabel}</div>
        <div className="mf-end bottom">{yourLabel}</div>
        <div className="mf-halfway" aria-hidden="true" />

        {slots.map((s) => {
          const [x, y] = FIELD_POS[s.slot] ?? [50, 50];
          const mineTop = yourY(y);
          const youWon = s.you.score > s.cpu.score;
          const cpuWon = s.cpu.score > s.you.score;
          return (
            <div key={s.slot}>
              <div
                className={`mf-token mine ${youWon ? "won" : ""}`}
                style={{ left: `${x}%`, top: `${mineTop}%` }}
                title={`${s.you.name}, ${s.you.team} ${s.you.season}`}
              >
                <span className="mf-pos">{s.slot}</span>
                <span className="mf-name">{surname(s.you.name)}</span>
                <span className="mf-pts">{s.you.score.toFixed(1)}</span>
              </div>
              <div
                className={`mf-token theirs ${cpuWon ? "won" : ""}`}
                style={{ left: `${100 - x}%`, top: `${100 - mineTop}%` }}
                title={`${s.cpu.name}, ${s.cpu.team} ${s.cpu.season}`}
              >
                <span className="mf-pos">{s.slot}</span>
                <span className="mf-name">{surname(s.cpu.name)}</span>
                <span className="mf-pts">{s.cpu.score.toFixed(1)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
