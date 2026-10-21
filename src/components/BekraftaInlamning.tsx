/**
 * Ersätter knappraden när eleven försöker lämna in. Rutan kommer varje gång;
 * med obesvarade frågor säger den hur många. Se src/lib/obesvarade.ts för
 * varför - och för varför knappen tillbaka står där Skicka svar stod.
 */
interface Props {
  obesvarade: number;
  totalt: number;
  submitting: boolean;
  onFortsatt: () => void;
  onLamnaIn: () => void;
}

export default function BekraftaInlamning({ obesvarade, totalt, submitting, onFortsatt, onLamnaIn }: Props) {
  const allaBesvarade = obesvarade === 0;
  return (
    <div
      className={
        allaBesvarade
          ? "bg-surface border border-border rounded-xl p-5"
          : "bg-warning-light border border-warning/20 rounded-xl p-5"
      }
      role="alertdialog"
      aria-labelledby="bekrafta-inlamning-rubrik"
    >
      <p id="bekrafta-inlamning-rubrik" className="font-semibold">
        {allaBesvarade
          ? "Vill du lämna in?"
          : `Du har inte svarat på ${obesvarade} av ${totalt} ${totalt === 1 ? "fråga" : "frågor"}.`}
      </p>
      <p className="text-sm text-muted mt-1">
        {allaBesvarade
          ? "Du kan inte ändra dina svar efteråt."
          : "Lämnar du in nu kan du inte fortsätta på dina svar efteråt."}
      </p>
      <div className="flex gap-3 mt-4">
        <button
          type="button"
          onClick={onLamnaIn}
          disabled={submitting}
          className="btn-secondary py-3 px-5"
        >
          {submitting ? "Skickar..." : allaBesvarade ? "Lämna in" : "Lämna in ändå"}
        </button>
        <button
          type="button"
          onClick={onFortsatt}
          disabled={submitting}
          className="btn-primary flex-1 py-3"
          autoFocus
        >
          {allaBesvarade ? "Gå tillbaka" : "Fortsätt svara"}
        </button>
      </div>
    </div>
  );
}
